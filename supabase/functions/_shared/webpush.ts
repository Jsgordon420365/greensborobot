/**
 * Standards-based Web Push.
 *
 * Implements VAPID (RFC 8292) and aes128gcm message encryption (RFC 8291)
 * using only WebCrypto, so the same module runs unchanged in Deno on Supabase
 * and in Node under test. No third-party push dependency, paid or otherwise.
 *
 * Nothing here logs an endpoint, a key or an auth secret.
 */

import type { NagimalsPushPayload } from './domain/index.ts';

const encoder = new TextEncoder();

// --------------------------------------------------------------- base64url --

export function b64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(withPadding);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** WebCrypto wants an ArrayBuffer, and a subarray view is not one. */
function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

// -------------------------------------------------------------------- HKDF --

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    buf(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, buf(data)));
}

/** One-block HKDF, which is all RFC 8291 ever needs. */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, Uint8Array.of(1)));
  return okm.slice(0, length);
}

// ------------------------------------------------------------------- VAPID --

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 point. */
  publicKey: string;
  /** base64url, 32-byte scalar. */
  privateKey: string;
  /** `mailto:` or `https:` contact, per RFC 8292. */
  subject: string;
}

async function importVapidPrivateKey(keys: VapidKeys): Promise<CryptoKey> {
  const pub = b64urlToBytes(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY must be a 65-byte uncompressed P-256 point.');
  }
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: keys.privateKey,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    ext: true,
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
}

/** Build the `Authorization: vapid t=…, k=…` header value. */
export async function vapidAuthorization(
  audience: string,
  keys: VapidKeys,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = {
    aud: audience,
    // RFC 8292 caps this at 24 hours; twelve is the customary margin.
    exp: nowSeconds + 12 * 60 * 60,
    sub: keys.subject,
  };

  const signingInput = `${bytesToB64url(encoder.encode(JSON.stringify(header)))}.${bytesToB64url(
    encoder.encode(JSON.stringify(claims)),
  )}`;

  const key = await importVapidPrivateKey(keys);
  // WebCrypto emits the raw r||s form ES256 requires, not DER.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      buf(encoder.encode(signingInput)),
    ),
  );

  const jwt = `${signingInput}.${bytesToB64url(signature)}`;
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}

// -------------------------------------------------------------- encryption --

export interface SubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface EncryptedMessage {
  body: Uint8Array;
  /** The ephemeral public key, exposed for tests. */
  serverPublicKey: Uint8Array;
  salt: Uint8Array;
}

const RECORD_SIZE = 4096;

/**
 * Encrypt a payload for one subscription using aes128gcm.
 *
 * `salt` and `serverKeyPair` are injectable so the test can reproduce a known
 * vector; production always generates both fresh.
 */
export async function encryptPayload(
  subscription: Pick<SubscriptionKeys, 'p256dh' | 'auth'>,
  payload: string,
  overrides: { salt?: Uint8Array; serverKeyPair?: CryptoKeyPair } = {},
): Promise<EncryptedMessage> {
  const uaPublic = b64urlToBytes(subscription.p256dh);
  const authSecret = b64urlToBytes(subscription.auth);

  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error('The subscription p256dh key is not a valid P-256 point.');
  }

  const serverKeyPair =
    overrides.serverKeyPair ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair);

  const serverPublicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey),
  );

  const uaKey = await crypto.subtle.importKey(
    'raw',
    buf(uaPublic),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaKey },
      serverKeyPair.privateKey,
      256,
    ),
  );

  // RFC 8291 §3.4: derive the input keying material from the shared secret.
  const keyInfo = concat(
    encoder.encode('WebPush: info'),
    Uint8Array.of(0),
    uaPublic,
    serverPublicKey,
  );
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(
    salt,
    ikm,
    concat(encoder.encode('Content-Encoding: aes128gcm'), Uint8Array.of(0)),
    16,
  );
  const nonce = await hkdf(
    salt,
    ikm,
    concat(encoder.encode('Content-Encoding: nonce'), Uint8Array.of(0)),
    12,
  );

  const aesKey = await crypto.subtle.importKey('raw', buf(cek), { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);

  // A single record, so the padding delimiter is 0x02.
  const plaintext = concat(encoder.encode(payload), Uint8Array.of(2));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: buf(nonce), tagLength: 128 },
      aesKey,
      buf(plaintext),
    ),
  );

  // Header: salt(16) || record size(4) || key id length(1) || key id(65)
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE, false);
  const header = concat(
    salt,
    recordSize,
    Uint8Array.of(serverPublicKey.length),
    serverPublicKey,
  );

  return { body: concat(header, ciphertext), serverPublicKey, salt };
}

// -------------------------------------------------------------------- send --

/**
 * Deliver one notification. Returns false when the endpoint is gone (404/410),
 * which the caller uses to retire a dead subscription.
 */
export async function sendWebPush(
  subscription: SubscriptionKeys,
  payload: NagimalsPushPayload,
  keys: { publicKey: string; privateKey: string; subject: string },
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const audience = new URL(subscription.endpoint).origin;
  const authorization = await vapidAuthorization(audience, {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    subject: keys.subject,
  });

  const encrypted = await encryptPayload(subscription, JSON.stringify(payload));

  const response = await fetchImpl(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: payload.stage >= 4 ? 'high' : 'normal',
    },
    body: buf(encrypted.body),
  });

  return response.ok;
}

// --------------------------------------------------------------- payloads --

// Payload wording is part of the deterministic rules, so it is defined once in
// the rules package and re-exported here for the Function to use.
export { buildPushPayload, selectNotificationReason } from './domain/index.ts';
