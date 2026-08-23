/**
 * send-due-notifications
 *
 * Evaluates every household and sends a web push wherever the rules engine
 * says `shouldNotify` — which already accounts for quiet hours and the
 * one-hour per-responsibility cooldown.
 *
 * Callable by hand for the proof of concept:
 *
 *   curl -X POST "$SUPABASE_URL/functions/v1/send-due-notifications" \
 *        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
 *        -H "Content-Type: application/json" -d '{}'
 *
 * To run it on a schedule later, enable pg_cron and pg_net in the project and
 * schedule a net.http_post to this URL every fifteen minutes. See
 * docs/ARCHITECTURE.md for the exact statement.
 */

import { fail, json, log, preflight, serviceClient } from '../_shared/http.ts';
import { evaluate, loadHousehold, persistSnapshots, resolveNow } from '../_shared/household.ts';
import { buildPushPayload, sendWebPush } from '../_shared/webpush.ts';

Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;

  // This function crosses user boundaries by design, so it demands the
  // service-role key rather than a user JWT.
  const provided = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey || provided !== serviceKey) {
    return fail('This endpoint requires the service-role key.', 401);
  }

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:nagimals@example.com';
  const appUrl = Deno.env.get('APP_URL') ?? '';

  if (!publicKey || !privateKey) {
    return fail('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set as Function secrets.', 500);
  }

  try {
    const admin = serviceClient();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const now = resolveNow(body.now);
    const dryRun = body.dryRun === true;

    const { data: owners, error } = await admin.from('households').select('owner_id');
    if (error) throw error;

    const uniqueOwners = [...new Set((owners ?? []).map((r) => String(r.owner_id)))];
    let sent = 0;
    let skipped = 0;
    const previews: unknown[] = [];

    for (const ownerId of uniqueOwners) {
      const loaded = await loadHousehold(admin, ownerId);
      if (!loaded) continue;

      const result = evaluate(loaded, now);
      await persistSnapshots(admin, result.evaluations);

      const due = result.evaluations.filter((e) => e.shouldNotify);
      if (due.length === 0) continue;

      const { data: subscriptions } = await admin
        .from('push_subscriptions')
        .select('*')
        .eq('owner_id', ownerId)
        .is('revoked_at', null);

      for (const evaluation of due) {
        const nagimal = loaded.nagimals.find((n) => n.id === evaluation.nagimalId);
        const responsibility = loaded.responsibilities.find(
          (r) => r.id === evaluation.responsibilityId,
        );
        const interveningFor = evaluation.interveningFor
          ? (loaded.nagimals.find((n) => n.id === evaluation.interveningFor)?.name ?? null)
          : null;

        const payload = buildPushPayload({
          nagimalName: nagimal?.name ?? 'A household member',
          nagimalId: evaluation.nagimalId,
          responsibilityId: evaluation.responsibilityId,
          responsibilityTitle: responsibility?.title ?? null,
          stage: evaluation.stage,
          state: evaluation.state,
          reasons: evaluation.reasons,
          soundKey: evaluation.sound,
          interveningForName: interveningFor,
          appUrl,
        });

        if (dryRun) {
          previews.push(payload);
          continue;
        }

        if (!subscriptions || subscriptions.length === 0) {
          skipped += 1;
          continue;
        }

        for (const subscription of subscriptions) {
          const ok = await sendWebPush(
            {
              endpoint: String(subscription.endpoint),
              p256dh: String(subscription.p256dh),
              auth: String(subscription.auth),
            },
            payload,
            { publicKey, privateKey, subject },
          );
          if (ok) sent += 1;
          else {
            skipped += 1;
            // A gone endpoint is dead; mark it rather than retrying forever.
            await admin
              .from('push_subscriptions')
              .update({ revoked_at: new Date().toISOString() })
              .eq('endpoint', subscription.endpoint);
          }
        }

        // Recording the send is what enforces the cooldown next time round.
        if (evaluation.responsibilityId) {
          await admin.from('household_events').insert({
            household_id: loaded.household.id,
            owner_id: ownerId,
            nagimal_id: evaluation.nagimalId,
            responsibility_id: evaluation.responsibilityId,
            event_type: 'notification_sent',
            event_payload: { stage: evaluation.stage, transport: 'web-push' },
          });
        }
      }
    }

    log('info', 'push.send', 'Notification sweep finished', {
      owners: uniqueOwners.length,
      sent,
      skipped,
      dryRun,
    });

    return json({ owners: uniqueOwners.length, sent, skipped, dryRun, previews });
  } catch (error) {
    log('error', 'push.send', 'Notification sweep failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return fail('The notification sweep failed.', 500);
  }
});
