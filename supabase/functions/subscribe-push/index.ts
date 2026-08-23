/**
 * subscribe-push
 *
 * Validates and stores one browser push subscription for the caller.
 *
 * The endpoint and keys are credentials: they are written to the row and never
 * echoed back, and the log line records only that a subscription exists.
 */

import { authenticate, fail, json, log, preflight } from '../_shared/http.ts';

function looksLikeEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 20 || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;

  try {
    const caller = await authenticate(request);
    if (!caller) return fail('Sign in to subscribe to notifications.', 401);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { endpoint, p256dh, auth, userAgent } = body;

    if (!looksLikeEndpoint(endpoint)) return fail('A valid HTTPS push endpoint is required.');
    if (typeof p256dh !== 'string' || p256dh.length < 10) return fail('A p256dh key is required.');
    if (typeof auth !== 'string' || auth.length < 6) return fail('An auth secret is required.');

    const { error } = await caller.client.from('push_subscriptions').upsert(
      {
        owner_id: caller.userId,
        endpoint,
        p256dh,
        auth,
        user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 400) : null,
        revoked_at: null,
      },
      { onConflict: 'endpoint' },
    );
    if (error) throw error;

    log('info', 'push.subscribe', 'Stored a push subscription', {
      ownerId: caller.userId,
      hasEndpoint: true,
    });

    return json({ ok: true });
  } catch (error) {
    log('error', 'push.subscribe', 'Could not store the subscription', {
      message: error instanceof Error ? error.message : String(error),
    });
    return fail('Could not store that subscription.', 500);
  }
});
