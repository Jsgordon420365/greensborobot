/**
 * record-action
 *
 * Applies one meaningful action, writes the event, awards any keepsake, then
 * re-evaluates and returns the updated canonical state.
 *
 * Ownership is validated explicitly *and* enforced by RLS, because the caller's
 * own JWT is what queries the database.
 */

import { authenticate, fail, json, log, preflight } from '../_shared/http.ts';
import { applyAction } from '../_shared/domain/index.ts';
import type { ActionKind } from '../_shared/domain/index.ts';
import {
  evaluate,
  loadHousehold,
  persistSnapshots,
  resolveNow,
  responsibilityToRow,
  toResponse,
} from '../_shared/household.ts';

const ALLOWED: ActionKind[] = [
  'attended',
  'completed',
  'snoozed',
  'dormant',
  'converted_to_resource',
  'archived',
  'reactivated',
];

Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;

  try {
    const caller = await authenticate(request);
    if (!caller) return fail('Sign in to record an action.', 401);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const responsibilityId = typeof body.responsibilityId === 'string' ? body.responsibilityId : null;
    const kind = body.kind as ActionKind;

    if (!responsibilityId) return fail('responsibilityId is required.');
    if (!ALLOWED.includes(kind)) return fail(`Unsupported action "${String(kind)}".`);

    const now = resolveNow(body.now);
    const loaded = await loadHousehold(caller.client, caller.userId);
    if (!loaded) return fail('This account has no household yet.', 404);

    const responsibility = loaded.responsibilities.find((r) => r.id === responsibilityId);
    if (!responsibility) return fail('That responsibility does not exist.', 404);
    if (responsibility.ownerId !== caller.userId) return fail('Not yours.', 403);

    const outcome = applyAction(responsibility, {
      kind,
      now,
      nextCommitmentAt:
        typeof body.nextCommitmentAt === 'string' ? body.nextCommitmentAt : null,
      note: typeof body.note === 'string' ? body.note : null,
    });

    const update = await caller.client
      .from('responsibilities')
      .update(responsibilityToRow(outcome.responsibility))
      .eq('id', responsibilityId);
    if (update.error) throw update.error;

    await caller.client.from('household_events').insert({
      household_id: outcome.event.householdId,
      owner_id: outcome.event.ownerId,
      nagimal_id: outcome.event.nagimalId,
      responsibility_id: outcome.event.responsibilityId,
      event_type: outcome.event.eventType,
      event_payload: outcome.event.eventPayload,
    });

    for (const accessory of outcome.accessories) {
      // The unique constraint means finishing twice never stacks the same pin.
      const insert = await caller.client
        .from('earned_accessories')
        .upsert(
          {
            nagimal_id: accessory.nagimalId,
            accessory_key: accessory.accessoryKey,
            earned_reason: accessory.earnedReason,
            equipped: accessory.equipped,
          },
          { onConflict: 'nagimal_id,accessory_key', ignoreDuplicates: true },
        );
      if (!insert.error) {
        await caller.client.from('household_events').insert({
          household_id: outcome.event.householdId,
          owner_id: caller.userId,
          nagimal_id: accessory.nagimalId,
          responsibility_id: responsibilityId,
          event_type: 'accessory_earned',
          event_payload: {
            accessoryKey: accessory.accessoryKey,
            reason: accessory.earnedReason,
          },
        });
      }
    }

    const reloaded = await loadHousehold(caller.client, caller.userId);
    if (!reloaded) return fail('The household disappeared mid-action.', 500);

    const result = evaluate(reloaded, now);
    await persistSnapshots(caller.client, result.evaluations);

    log('info', 'action.record', `Recorded a "${kind}" action`, {
      ownerId: caller.userId,
      responsibilityId,
      kind,
      accessoriesEarned: outcome.accessories.length,
    });

    return json(toResponse(result));
  } catch (error) {
    log('error', 'action.record', 'Action failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return fail('Could not record that action.', 500);
  }
});
