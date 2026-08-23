/**
 * Generates a VAPID key pair with no dependencies.
 *
 * The public key goes in VITE_VAPID_PUBLIC_KEY (browser) and VAPID_PUBLIC_KEY
 * (Function secret). The private key goes ONLY in VAPID_PRIVATE_KEY, as a
 * Supabase Function secret. It must never appear in a VITE_ variable, in the
 * client bundle, or in the repository.
 *
 *   npm run gen:vapid
 */

const { subtle } = globalThis.crypto;

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);

const publicRaw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
const jwk = await subtle.exportKey('jwk', pair.privateKey);

console.log('# Add to your .env (public) and Supabase Function secrets (both):');
console.log('');
console.log(`VITE_VAPID_PUBLIC_KEY=${b64url(publicRaw)}`);
console.log(`VAPID_PUBLIC_KEY=${b64url(publicRaw)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log('VAPID_SUBJECT=mailto:you@example.com');
console.log('');
console.log('# VAPID_PRIVATE_KEY is a secret. Never commit it, never expose it to the browser.');
