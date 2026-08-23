/**
 * "The Fern, the Cat and the Deadline" — the principal demonstration, walked
 * end to end against the pure rules engine.
 *
 * Each `it` maps to a numbered step in the acceptance scenario, so a failure
 * names the exact step of the demo that broke.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAT_INTERVENTION_GRACE_MS,
  DAY,
  HOUR,
  MINUTE,
  applyAction,
  evaluateHousehold,
  seedDemoHousehold,
} from '../domain';
import type { NagimalEvaluation, SeedResult } from '../domain';

const NOW = Date.parse('2026-03-10T12:00:00.000Z');
const OWNER = 'evaluator';

describe('Scenario: The Fern, the Cat and the Deadline', () => {
  let seed: SeedResult;
  let dogId: string;
  let catId: string;
  let fernId: string;

  const at = (now: number): Record<string, NagimalEvaluation> => {
    const results = evaluateHousehold(
      {
        household: seed.household,
        nagimals: seed.nagimals,
        responsibilities: seed.responsibilities,
      },
      { now, localHour: 12 },
    );
    return Object.fromEntries(results.map((r) => [r.nagimalId, r]));
  };

  beforeEach(() => {
    seed = seedDemoHousehold(OWNER, { now: NOW });
    [dogId, catId, fernId] = seed.nagimals.map((n) => n.id);
  });

  it('step 1: the household opens with all three entities calm', () => {
    const h = at(NOW);
    expect(h[dogId].stage).toBe(0);
    expect(h[dogId].state).toBe('resting');
    expect(h[catId].stage).toBe(0);
    expect(h[fernId].stage).toBe(0);
    expect(h[fernId].state).toBe('healthy');
  });

  it('steps 2-3: advancing time makes Frondly reach stage 2 and visibly droop', () => {
    // The fern starts six days stale against a seven-day interval, so it
    // crosses 1.5x its interval four and a half days from now.
    const h = at(NOW + 5 * DAY);
    expect(h[fernId].stage).toBe(2);
    expect(h[fernId].state).toBe('drooping');
    expect(h[fernId].animation).toBe('fern_drooping');
  });

  it('step 4: further neglect takes Frondly to stage 3', () => {
    const h = at(NOW + 8 * DAY + HOUR);
    expect(h[fernId].stage).toBe(3);
    expect(h[fernId].state).toBe('wilted');
  });

  it('step 5: Juniper enters intervening_for_plant once the grace period passes', () => {
    const h = at(NOW + 8 * DAY + CAT_INTERVENTION_GRACE_MS + HOUR);
    expect(h[catId].state).toBe('intervening_for_plant');
    expect(h[catId].interveningFor).toBe(fernId);
  });

  it('step 6: the reason for the intervention is deterministic and readable', () => {
    const h = at(NOW + 10 * DAY);
    const reason = h[catId].reasons.find((r) => r.includes('intervening'));
    expect(reason).toBeDefined();
    expect(reason).toMatch(/Juniper is intervening because Frondly reached stage 3/);
    // Identical inputs must produce an identical explanation.
    expect(at(NOW + 10 * DAY)[catId].reasons).toEqual(h[catId].reasons);
  });

  it('step 7-8: three hours before the deadline Bear approaches with restrained barks', () => {
    const h = at(NOW + 3 * DAY - 2 * HOUR);
    expect(h[dogId].stage).toBe(3);
    expect(h[dogId].state).toBe('nudging');
    expect(h[dogId].animation).toBe('dog_nudge');
    expect(h[dogId].sound).toBe('dog_soft_bark');
  });

  it('steps 9-10: fifteen minutes before the deadline Bear reaches stage 4', () => {
    const h = at(NOW + 3 * DAY - 15 * MINUTE);
    expect(h[dogId].stage).toBe(4);
    expect(h[dogId].state).toBe('barking');
    expect(h[dogId].sound).toBe('dog_bark');
  });

  it('step 11: stage 4 is eligible to raise exactly one notification', () => {
    const when = NOW + 3 * DAY - 15 * MINUTE;
    const first = at(when)[dogId];
    expect(first.shouldNotify).toBe(true);

    // A second evaluation inside the cooldown must not notify again.
    const second = evaluateHousehold(
      {
        household: seed.household,
        nagimals: seed.nagimals,
        responsibilities: seed.responsibilities,
      },
      {
        now: when + MINUTE,
        localHour: 12,
        notificationHistory: { [first.responsibilityId!]: when },
      },
    ).find((r) => r.nagimalId === dogId)!;
    expect(second.stage).toBe(4);
    expect(second.shouldNotify).toBe(false);
  });

  it('steps 12-13: completing the Project settles Bear and earns a keepsake', () => {
    const when = NOW + 3 * DAY - 15 * MINUTE;
    const proposal = seed.responsibilities.find((r) => r.nagimalId === dogId)!;
    expect(at(when)[dogId].stage).toBe(4);

    const outcome = applyAction(proposal, { kind: 'completed', now: when });
    seed.responsibilities = seed.responsibilities.map((r) =>
      r.id === proposal.id ? outcome.responsibility : r,
    );

    const after = at(when);
    expect(after[dogId].stage).toBe(0);
    expect(after[dogId].state).toBe('resting');
    expect(outcome.accessories).toHaveLength(1);
    expect(outcome.accessories[0].equipped).toBe(true);
    // The dog is still a dog. No species change, no evolution.
    expect(seed.nagimals.find((n) => n.id === dogId)!.species).toBe('dog');
  });

  it('steps 14-15: attending Frondly starts its recovery and stops the intervention', () => {
    const when = NOW + 10 * DAY;
    expect(at(when)[catId].state).toBe('intervening_for_plant');

    const notes = seed.responsibilities.find((r) => r.nagimalId === fernId)!;
    const outcome = applyAction(notes, { kind: 'attended', now: when });
    seed.responsibilities = seed.responsibilities.map((r) =>
      r.id === notes.id ? outcome.responsibility : r,
    );

    const after = at(when);
    expect(after[fernId].stage).toBe(0);
    expect(after[fernId].state).toBe('healthy');
    expect(after[catId].state).not.toBe('intervening_for_plant');
    expect(after[catId].interveningFor).toBeNull();
  });

  it('the fern is never depicted as permanently dead', () => {
    const h = at(NOW + 5 * 365 * DAY);
    expect(h[fernId].stage).toBe(4);
    expect(h[fernId].state).toBe('severely_wilted');
    // Stage 4 is the floor. There is no "dead" state to fall into.
    expect(h[fernId].message).toMatch(/can still recover/i);
  });

  it('the whole timeline is reproducible from the same seed', () => {
    const replay = seedDemoHousehold(OWNER, { now: NOW });
    const timeline = [0, 5 * DAY, 8 * DAY, 10 * DAY, 3 * DAY - 15 * MINUTE];
    for (const offset of timeline) {
      const a = evaluateHousehold(
        { household: seed.household, nagimals: seed.nagimals, responsibilities: seed.responsibilities },
        { now: NOW + offset, localHour: 12 },
      ).map((r) => [r.stage, r.state, r.reasons]);
      const b = evaluateHousehold(
        { household: replay.household, nagimals: replay.nagimals, responsibilities: replay.responsibilities },
        { now: NOW + offset, localHour: 12 },
      ).map((r) => [r.stage, r.state, r.reasons]);
      expect(a).toEqual(b);
    }
  });
});
