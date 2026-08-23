/**
 * Verifies the Web Push implementation against the specs it claims to follow.
 *
 * The module under test is the one the Edge Function actually deploys — the
 * synced copy under `supabase/functions/_shared` — and it uses only WebCrypto,
 * so Node can exercise it exactly as Deno will.
 *
 * The encryption test does a real round trip: it derives the same keys from the
 * subscriber's side and decrypts the ciphertext back to the original payload.
 * That is the only way to be sure the derivation matches RFC 8291 rather than
 * merely producing plausible-looking bytes.
 */

import { describe, expect, it } from 'vitest';
import {
  b64urlToBytes,
  buildPushPayload,
  bytesToB64url,
  encryptPayload,
  vapidAuthorization,
} from '../../supabase/functions/_shared/webpush.ts';
import { selectNotificationReason } from '../domain';

const { subtle } = globalThis.crypto;

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function ab(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await subtle.importKey('raw', ab(key), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await subtle.sign('HMAC', k, ab(data)));
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, Uint8Array.of(1)))).slice(0, length);
}

/** Stand in for a browser: generate a real subscription key pair. */
async function makeSubscription() {
  const pair = (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const publicRaw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  return {
    keyPair: pair,
    publicRaw,
    authSecret,
    p256dh: bytesToB64url(publicRaw),
    auth: bytesToB64url(authSecret),
  };
}

describe('base64url', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(97));
    expect(Array.from(b64urlToBytes(bytesToB64url(bytes)))).toEqual(Array.from(bytes));
  });

  it('emits no padding or URL-unsafe characters', () => {
    const encoded = bytesToB64url(new Uint8Array([251, 255, 190, 0, 1]));
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe('VAPID (RFC 8292)', () => {
  it('produces a verifiable ES256 JWT with the right claims', async () => {
    const pair = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const publicRaw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
    const jwk = await subtle.exportKey('jwk', pair.privateKey);

    const now = 1_800_000_000;
    const header = await vapidAuthorization(
      'https://fcm.googleapis.com',
      {
        publicKey: bytesToB64url(publicRaw),
        privateKey: jwk.d!,
        subject: 'mailto:nagimals@example.com',
      },
      now,
    );

    expect(header).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);

    const token = header.slice('vapid t='.length, header.indexOf(', k='));
    const [h, c, s] = token.split('.');

    const decodedHeader = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    expect(decodedHeader).toEqual({ typ: 'JWT', alg: 'ES256' });

    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(c)));
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe('mailto:nagimals@example.com');
    expect(claims.exp).toBe(now + 12 * 60 * 60);
    // RFC 8292 forbids an expiry more than 24 hours out.
    expect(claims.exp - now).toBeLessThanOrEqual(24 * 60 * 60);

    // The signature must verify against the advertised public key.
    const verified = await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      ab(b64urlToBytes(s)),
      ab(new TextEncoder().encode(`${h}.${c}`)),
    );
    expect(verified).toBe(true);

    // The `k=` parameter must be the same public key.
    expect(header.endsWith(bytesToB64url(publicRaw))).toBe(true);
  });

  it('rejects a malformed public key rather than signing garbage', async () => {
    await expect(
      vapidAuthorization('https://example.com', {
        publicKey: bytesToB64url(new Uint8Array(10)),
        privateKey: 'nope',
        subject: 'mailto:a@b.c',
      }),
    ).rejects.toThrow(/65-byte uncompressed/);
  });
});

describe('aes128gcm payload encryption (RFC 8291)', () => {
  it('produces a body the subscriber can decrypt back to the payload', async () => {
    const subscription = await makeSubscription();
    const payload = JSON.stringify({ title: 'Bear needs you now', stage: 4 });

    const { body } = await encryptPayload(
      { p256dh: subscription.p256dh, auth: subscription.auth },
      payload,
    );

    // --- parse the aes128gcm header, exactly as a push service would ------
    const salt = body.slice(0, 16);
    const recordSize = new DataView(ab(body.slice(16, 20))).getUint32(0, false);
    const keyIdLength = body[20];
    const serverPublic = body.slice(21, 21 + keyIdLength);
    const ciphertext = body.slice(21 + keyIdLength);

    expect(recordSize).toBe(4096);
    expect(keyIdLength).toBe(65);
    expect(serverPublic[0]).toBe(0x04);

    // --- derive the same keys from the subscriber's private key ----------
    const serverKey = await subtle.importKey(
      'raw',
      ab(serverPublic),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
    const shared = new Uint8Array(
      await subtle.deriveBits({ name: 'ECDH', public: serverKey }, subscription.keyPair.privateKey, 256),
    );

    const keyInfo = concat(
      new TextEncoder().encode('WebPush: info'),
      Uint8Array.of(0),
      subscription.publicRaw,
      serverPublic,
    );
    const ikm = await hkdf(subscription.authSecret, shared, keyInfo, 32);
    const cek = await hkdf(
      salt,
      ikm,
      concat(new TextEncoder().encode('Content-Encoding: aes128gcm'), Uint8Array.of(0)),
      16,
    );
    const nonce = await hkdf(
      salt,
      ikm,
      concat(new TextEncoder().encode('Content-Encoding: nonce'), Uint8Array.of(0)),
      12,
    );

    const aesKey = await subtle.importKey('raw', ab(cek), { name: 'AES-GCM' }, false, ['decrypt']);
    const plaintext = new Uint8Array(
      await subtle.decrypt({ name: 'AES-GCM', iv: ab(nonce), tagLength: 128 }, aesKey, ab(ciphertext)),
    );

    // The last byte is the single-record padding delimiter.
    expect(plaintext[plaintext.length - 1]).toBe(2);
    expect(new TextDecoder().decode(plaintext.slice(0, -1))).toBe(payload);
  });

  it('uses a fresh salt and ephemeral key for every message', async () => {
    const subscription = await makeSubscription();
    const a = await encryptPayload(subscription, 'hello');
    const b = await encryptPayload(subscription, 'hello');
    expect(bytesToB64url(a.salt)).not.toBe(bytesToB64url(b.salt));
    expect(bytesToB64url(a.serverPublicKey)).not.toBe(bytesToB64url(b.serverPublicKey));
    expect(bytesToB64url(a.body)).not.toBe(bytesToB64url(b.body));
  });

  it('refuses a subscription key that is not a P-256 point', async () => {
    await expect(
      encryptPayload({ p256dh: bytesToB64url(new Uint8Array(20)), auth: 'AAAAAAAAAAAAAAAA' }, 'x'),
    ).rejects.toThrow(/not a valid P-256 point/);
  });
});

describe('push payload shape', () => {
  const base = {
    nagimalId: 'nagimal-1',
    responsibilityId: 'resp-1',
    stage: 4 as const,
    soundKey: 'dog_bark',
    appUrl: 'https://nagimals.example',
  };

  it('uses a deterministic reason as the body, not a generated sentence', () => {
    const payload = buildPushPayload({
      ...base,
      nagimalName: 'Bear',
      responsibilityTitle: 'Submit the proposal',
      state: 'barking',
      reasons: [
        'This reminder has been snoozed 3 times.',
        'The deadline is 25 minutes away, inside the 45 minutes window for stage 4.',
      ],
    });
    expect(payload.title).toBe('Bear needs you now');
    expect(payload.body).toMatch(/deadline is 25 minutes away/);
    expect(payload.deepLink).toBe('https://nagimals.example/#/household?responsibility=resp-1');
    expect(payload.eventId).toBe('nagimal-1:resp-1:4');
  });

  it('titles a cat intervention as making a scene', () => {
    const payload = buildPushPayload({
      ...base,
      nagimalName: 'Juniper',
      responsibilityTitle: 'Revisit the neglected prototype notes',
      state: 'intervening_for_plant',
      interveningForName: 'Frondly',
      reasons: ['Juniper is intervening because Frondly reached stage 3.'],
    });
    expect(payload.title).toBe('Juniper has started making a scene');
    expect(payload.body).toMatch(/Frondly reached stage 3/);
  });

  it('leads with the cause, not the aggravating factor', () => {
    // A person woken at stage four needs the deadline before the snooze count.
    expect(
      selectNotificationReason(
        [
          'This reminder has been snoozed 3 times.',
          'The deadline is 25 minutes away, inside the 45 minutes window for stage 4.',
        ],
        'fallback',
      ),
    ).toMatch(/deadline is 25 minutes away/);
  });

  it('puts an intervention above every other reason', () => {
    expect(
      selectNotificationReason(
        [
          'The deadline is 25 minutes away.',
          'Juniper is intervening because Frondly reached stage 3.',
        ],
        'fallback',
      ),
    ).toMatch(/intervening because/);
  });

  it('falls back to a stage sentence when there are no reasons', () => {
    const payload = buildPushPayload({
      ...base,
      nagimalName: 'Bear',
      responsibilityTitle: 'Something',
      state: 'barking',
      reasons: [],
    });
    expect(payload.body).toBe('"Something" has reached stage 4.');
  });
});
