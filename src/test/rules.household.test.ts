import { describe, expect, it } from 'vitest';
import {
  CAT_INTERVENTION_GRACE_MS,
  DAY,
  HOUR,
  MINUTE,
  applyAction,
  evaluateHousehold,
  evaluateResponsibility,
  seedDemoHousehold,
} from '../domain';
import type { NagimalEvaluation, Responsibility, Stage } from '../domain';

const NOW = Date.parse('2026-03-10T12:00:00.000Z');
const OWNER = 'owner-1';

function scenario(now = NOW) {
  const seed = seedDemoHousehold(OWNER, { now });
  const [dog, cat, fern] = seed.nagimals;
  const [proposal, review, notes] = seed.responsibilities;
  return { seed, dog, cat, fern, proposal, review, notes };
}

function evalAt(
  now: number,
  seed: ReturnType<typeof seedDemoHousehold>,
  localHour = 12,
): Record<string, NagimalEvaluation> {
  const results = evaluateHousehold(
    { household: seed.household, nagimals: seed.nagimals, responsibilities: seed.responsibilities },
    { now, localHour },
  );
  return Object.fromEntries(results.map((r) => [r.nagimalId, r]));
}

describe('Area and plant neglect escalation', () => {
  function plantStageAfter(elapsedDays: number, overrides: Partial<Responsibility> = {}): Stage {
    const { seed, fern, notes } = scenario();
    const responsibility: Responsibility = {
      ...notes,
      lastAttentionAt: new Date(NOW).toISOString(),
      ...overrides,
    };
    void seed;
    return evaluateResponsibility(fern, responsibility, {
      now: NOW + elapsedDays * DAY,
      localHour: 12,
    }).stage;
  }

  it('is calm inside the expected interval', () => {
    expect(plantStageAfter(3)).toBe(0);
    expect(plantStageAfter(6.9)).toBe(0);
  });

  it('reaches stage 1 just past the interval', () => {
    expect(plantStageAfter(7.1)).toBe(1);
  });

  it('reaches stage 2 at 1.5x the interval', () => {
    expect(plantStageAfter(10.5)).toBe(2);
    expect(plantStageAfter(13)).toBe(2);
  });

  it('reaches stage 3 at 2x the interval', () => {
    expect(plantStageAfter(14)).toBe(3);
    expect(plantStageAfter(20)).toBe(3);
  });

  it('reaches stage 4 at 3x the interval, and stays recoverable', () => {
    expect(plantStageAfter(21)).toBe(4);
    expect(plantStageAfter(60)).toBe(4);
  });

  it('explains the neglect in a readable, deterministic sentence', () => {
    const { fern, notes } = scenario();
    const result = evaluateResponsibility(
      fern,
      { ...notes, lastAttentionAt: new Date(NOW).toISOString() },
      { now: NOW + 14 * DAY, localHour: 12 },
    );
    expect(result.reasons.join(' ')).toMatch(
      /no attention for 2 times its 7 days expected interval/i,
    );
  });

  it('a gentler reminder intensity tolerates more neglect', () => {
    expect(plantStageAfter(10.5, { reminderIntensity: 'gentle' })).toBeLessThan(
      plantStageAfter(10.5, { reminderIntensity: 'standard' }),
    );
  });

  it('never lets the plant raise a notification itself', () => {
    const { fern, notes } = scenario();
    const result = evaluateResponsibility(
      fern,
      { ...notes, lastAttentionAt: new Date(NOW).toISOString() },
      { now: NOW + 40 * DAY, localHour: 12 },
    );
    expect(result.stage).toBe(4);
    expect(result.shouldNotify).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/Plants never raise notifications directly/i);
  });

  it('cannot measure neglect without an interval', () => {
    const { fern, notes } = scenario();
    const result = evaluateResponsibility(
      fern,
      { ...notes, expectedAttentionIntervalMinutes: null },
      { now: NOW + 400 * DAY, localHour: 12 },
    );
    expect(result.stage).toBe(0);
  });
});

describe('cat intervention on behalf of the fern', () => {
  it('waits out the grace period before stepping in', () => {
    const { seed, fern, cat } = scenario();
    // Fern is six days stale at NOW, so it crosses 2x its 7-day interval at
    // day 14 of its own clock, i.e. NOW + 8 days.
    const justCrossed = NOW + 8 * DAY + MINUTE;
    const at = evalAt(justCrossed, seed);
    expect(at[fern.id].stage).toBeGreaterThanOrEqual(3);
    expect(at[cat.id].state).not.toBe('intervening_for_plant');
    expect(at[cat.id].reasons.join(' ')).toMatch(/waits 12 hours before stepping in/i);
  });

  it('intervenes once the fern has been wilted past the grace period', () => {
    const { seed, fern, cat } = scenario();
    const at = evalAt(NOW + 8 * DAY + CAT_INTERVENTION_GRACE_MS + MINUTE, seed);
    expect(at[fern.id].stage).toBeGreaterThanOrEqual(3);
    expect(at[cat.id].state).toBe('intervening_for_plant');
    expect(at[cat.id].interveningFor).toBe(fern.id);
    expect(at[cat.id].stage).toBe(3);
  });

  it('names the fern and the stage in its deterministic reason', () => {
    const { seed, cat } = scenario();
    const at = evalAt(NOW + 10 * DAY, seed);
    expect(at[cat.id].reasons.join(' ')).toMatch(
      /Juniper is intervening because Frondly reached stage \d/,
    );
  });

  it('says out loud that it is making a scene for the fern', () => {
    const { seed, cat } = scenario();
    const at = evalAt(NOW + 10 * DAY, seed);
    expect(at[cat.id].message).toMatch(/Frondly/);
  });

  it('does not intervene while the fern is healthy', () => {
    const { seed, cat, fern } = scenario();
    const at = evalAt(NOW, seed);
    expect(at[fern.id].stage).toBe(0);
    expect(at[cat.id].state).not.toBe('intervening_for_plant');
  });

  it('yields to a more urgent problem of its own', () => {
    const { seed, cat, fern } = scenario();
    // Give the cat's own Area a critical, badly overdue state.
    seed.responsibilities = seed.responsibilities.map((r) =>
      r.nagimalId === cat.id
        ? {
            ...r,
            importance: 'critical' as const,
            reminderIntensity: 'firm' as const,
            lastAttentionAt: new Date(NOW - 200 * DAY).toISOString(),
          }
        : r,
    );
    const at = evalAt(NOW + 10 * DAY, seed);
    expect(at[fern.id].stage).toBeGreaterThanOrEqual(3);
    expect(at[cat.id].stage).toBe(4);
    expect(at[cat.id].state).toBe('knocking_things_over');
    expect(at[cat.id].reasons.join(' ')).toMatch(/already has a more urgent problem/i);
  });
});

describe('cat intervention on behalf of the waiting dog', () => {
  it('steps in while the dog is waiting but not yet barking', () => {
    const { seed, dog, cat } = scenario();
    // 2 hours before the proposal deadline puts Bear at stage 3.
    const at = evalAt(NOW + 3 * DAY - 2 * HOUR, seed);
    expect(at[dog.id].stage).toBe(3);
    expect(at[cat.id].state).toBe('intervening_for_dog');
    expect(at[cat.id].interveningFor).toBe(dog.id);
    expect(at[cat.id].reasons.join(' ')).toMatch(/stepping in because Bear is at stage 3/);
  });

  it('does not step in once the dog is already barking', () => {
    const { seed, dog, cat } = scenario();
    const at = evalAt(NOW + 3 * DAY + HOUR, seed);
    expect(at[dog.id].stage).toBe(4);
    expect(at[cat.id].state).not.toBe('intervening_for_dog');
  });

  it('prefers the fern when both the fern and the dog need help', () => {
    const { seed, cat, fern } = scenario();
    // Day 10: the fern is well past its grace period and Bear is at stage 1.
    const at = evalAt(NOW + 10 * DAY, seed);
    expect(at[fern.id].stage).toBeGreaterThanOrEqual(3);
    expect(at[cat.id].state).toBe('intervening_for_plant');
  });
});

describe('a household is not three unrelated widgets', () => {
  it('rolls a Nagimal up to its most urgent responsibility', () => {
    const { seed, dog } = scenario();
    seed.responsibilities.push({
      ...seed.responsibilities[0],
      id: 'extra-1',
      title: 'A calm second Project',
      deadlineAt: new Date(NOW + 200 * DAY).toISOString(),
    });
    const at = evalAt(NOW + 3 * DAY - 10 * MINUTE, seed);
    expect(at[dog.id].stage).toBe(4);
    expect(at[dog.id].perResponsibility).toHaveLength(2);
    expect(at[dog.id].perResponsibility[0].stage).toBeGreaterThanOrEqual(
      at[dog.id].perResponsibility[1].stage,
    );
  });

  it('gives an unassigned Nagimal a calm, explained state', () => {
    const { seed, fern } = scenario();
    seed.responsibilities = seed.responsibilities.filter((r) => r.nagimalId !== fern.id);
    const at = evalAt(NOW, seed);
    expect(at[fern.id].stage).toBe(0);
    expect(at[fern.id].perResponsibility).toHaveLength(0);
    expect(at[fern.id].reasons.join(' ')).toMatch(/nothing assigned/i);
  });
});

describe('meaningful actions', () => {
  it('marking attended resets a plant and calms the cat', () => {
    const { seed, fern, cat, notes } = scenario();
    const neglected = NOW + 10 * DAY;
    expect(evalAt(neglected, seed)[cat.id].state).toBe('intervening_for_plant');

    const outcome = applyAction(notes, { kind: 'attended', now: neglected });
    seed.responsibilities = seed.responsibilities.map((r) =>
      r.id === notes.id ? outcome.responsibility : r,
    );

    const after = evalAt(neglected, seed);
    expect(after[fern.id].stage).toBe(0);
    expect(after[fern.id].state).toBe('healthy');
    expect(after[cat.id].state).not.toBe('intervening_for_plant');
    expect(outcome.event.eventType).toBe('attended');
  });

  it('a snooze increments the count and does not count as attention', () => {
    const { notes } = scenario();
    const outcome = applyAction(notes, {
      kind: 'snoozed',
      now: NOW,
      nextCommitmentAt: new Date(NOW + DAY).toISOString(),
    });
    expect(outcome.responsibility.snoozeCount).toBe(notes.snoozeCount + 1);
    expect(outcome.responsibility.lastAttentionAt).toBe(notes.lastAttentionAt);
    expect(outcome.responsibility.status).toBe('snoozed');
  });

  it('marking attended forgives one snooze but not the whole history', () => {
    const { proposal } = scenario();
    const outcome = applyAction({ ...proposal, snoozeCount: 3 }, { kind: 'attended', now: NOW });
    expect(outcome.responsibility.snoozeCount).toBe(2);
  });

  it('completing settles the dog and earns a keepsake', () => {
    const { seed, dog, proposal } = scenario();
    const urgent = NOW + 3 * DAY - 10 * MINUTE;
    expect(evalAt(urgent, seed)[dog.id].stage).toBe(4);

    const outcome = applyAction(proposal, { kind: 'completed', now: urgent });
    seed.responsibilities = seed.responsibilities.map((r) =>
      r.id === proposal.id ? outcome.responsibility : r,
    );

    const after = evalAt(urgent, seed);
    expect(after[dog.id].stage).toBe(0);
    expect(after[dog.id].state).toBe('resting');
    expect(outcome.accessories).toHaveLength(1);
    expect(outcome.accessories[0].nagimalId).toBe(dog.id);
    expect(outcome.accessories[0].accessoryKey).toBe('gold_star_pin');
  });

  it('awards a different keepsake when the finish took several snoozes', () => {
    const { proposal } = scenario();
    expect(
      applyAction({ ...proposal, snoozeCount: 1 }, { kind: 'completed', now: NOW })
        .accessories[0].accessoryKey,
    ).toBe('blue_bandana');
    expect(
      applyAction({ ...proposal, snoozeCount: 5 }, { kind: 'completed', now: NOW })
        .accessories[0].accessoryKey,
    ).toBe('brass_collar_charm');
  });

  it('converting to a Resource silences it without deleting it', () => {
    const { seed, notes } = scenario();
    const outcome = applyAction(notes, { kind: 'converted_to_resource', now: NOW });
    seed.responsibilities = seed.responsibilities.map((r) =>
      r.id === notes.id ? outcome.responsibility : r,
    );
    const after = evalAt(NOW + 100 * DAY, seed);
    expect(after[notes.nagimalId!].stage).toBe(0);
    expect(outcome.responsibility.paraClass).toBe('resource');
  });

  it('archiving keeps the item retrievable and quiet', () => {
    const { notes } = scenario();
    const outcome = applyAction(notes, { kind: 'archived', now: NOW });
    expect(outcome.responsibility.status).toBe('archived');
    expect(outcome.responsibility.paraClass).toBe('archive');
  });

  it('reactivating brings an archived Project back as a Project', () => {
    const { proposal } = scenario();
    const archived = applyAction(proposal, { kind: 'archived', now: NOW }).responsibility;
    const revived = applyAction(archived, { kind: 'reactivated', now: NOW }).responsibility;
    expect(revived.status).toBe('active');
    expect(revived.paraClass).toBe('project');
  });
});
