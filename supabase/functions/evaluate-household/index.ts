/**
 * evaluate-household
 *
 * The authoritative evaluation. Loads the caller's household, runs the shared
 * rules engine, records a snapshot whenever the state materially changed, and
 * returns the complete normalized household state.
 *
 * Stage-four notifications are gated by the same cooldown the engine applies,
 * so polling this endpoint cannot produce duplicate alerts.
 */

import { authenticate, fail, json, log, preflight } from '../_shared/http.ts';
import {
  evaluate,
  loadHousehold,
  persistSnapshots,
  resolveNow,
  toResponse,
} from '../_shared/household.ts';

Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;

  try {
    const caller = await authenticate(request);
    if (!caller) return fail('Sign in to evaluate a household.', 401);

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const now = resolveNow(body.now);
    const localHour =
      typeof body.localHour === 'number' ? body.localHour : new Date(now).getUTCHours();

    const loaded = await loadHousehold(caller.client, caller.userId);
    if (!loaded) return fail('This account has no household yet.', 404);

    const result = evaluate(loaded, now, localHour);
    const written = await persistSnapshots(caller.client, result.evaluations);

    log('info', 'rules.evaluate', 'Evaluated a household', {
      ownerId: caller.userId,
      householdId: loaded.household.id,
      snapshotsWritten: written,
      stages: result.evaluations.map((e) => `${e.state}:${e.stage}`),
      notifiable: result.evaluations.filter((e) => e.shouldNotify).length,
    });

    return json(toResponse(result));
  } catch (error) {
    log('error', 'rules.evaluate', 'Evaluation failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return fail('Could not evaluate the household.', 500);
  }
});
