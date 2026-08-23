import { describe, expect, it } from 'vitest';
import {
  DAY,
  HOUR,
  MINUTE,
  evaluateResponsibility,
  isWithinQuietHours,
  makeHousehold,
  makeNagimal,
  makeResponsibility,
} from '../domain';
import type { Importance, ReminderIntensity, Stage } from '../domain';

const NOW = Date.parse('2026-03-10T12:00:00.000Z');
const OWNER = 'owner-1';

function fixture(
  overrides: Parameters<typeof makeResponsibility>[0] extends infer _T
    ? Partial<Parameters<typeof makeResponsibility>[0]>
    : never = {},
) {
  const household = makeHousehold(OWNER, 'Home', NOW);
  const dog = makeNagimal({
    householdId: household.id,
    ownerId: OWNER,
    name: 'Bear',
    species: 'dog',
    appearanceVariant: 'bear',
    communicationStyle: 'calm',
    role: 'deadline guardian',
    now: NOW,
  });
  const responsibility = makeResponsibility({
    householdId: household.id,
    ownerId: OWNER,
    nagimalId: dog.id,
    title: 'Submit the proposal',
    paraClass: 'project',
    // Far enough back that the six-hour check-in grace never applies by default.
    lastAttentionAt: new Date(NOW - 3 * DAY).toISOString(),
    now: NOW,
    ...overrides,
  });
  return { household, dog, responsibility };
}

/** Evaluate a Project whose deadline is `msAway` from NOW. */
function stageAt(
  msAway: number,
  overrides: Record<string, unknown> = {},
  options: Record<string, unknown> = {},
): Stage {
  const { dog, responsibility } = fixture({
    deadlineAt: new Date(NOW + msAway).toISOString(),
    ...overrides,
  });
  return evaluateResponsibility(dog, responsibility, {
    now: NOW,
    localHour: 12,
    ...options,
  }).stage;
}

describe('Project deadline escalation', () => {
  it('rests while the deadline is more than 72 hours away', () => {
    expect(stageAt(10 * DAY)).toBe(0);
    expect(stageAt(73 * HOUR)).toBe(0);
  });

  it('wakes to stage 1 inside 72 hours', () => {
    expect(stageAt(71 * HOUR)).toBe(1);
    expect(stageAt(30 * HOUR)).toBe(1);
  });

  it('reaches stage 2 inside 24 hours', () => {
    expect(stageAt(23 * HOUR)).toBe(2);
    expect(stageAt(4 * HOUR)).toBe(2);
  });

  it('reaches stage 3 inside 3 hours', () => {
    expect(stageAt(2 * HOUR)).toBe(3);
    expect(stageAt(45 * MINUTE)).toBe(3);
  });

  it('reaches stage 4 inside 30 minutes', () => {
    expect(stageAt(29 * MINUTE)).toBe(4);
    expect(stageAt(1 * MINUTE)).toBe(4);
  });

  it('reaches stage 4 once overdue and says so', () => {
    const { dog, responsibility } = fixture({
      deadlineAt: new Date(NOW - 2 * HOUR).toISOString(),
    });
    const result = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    expect(result.stage).toBe(4);
    expect(result.state).toBe('barking');
    expect(result.reasons.join(' ')).toMatch(/deadline passed 2 hours ago/i);
  });

  it('boundaries are inclusive of the tighter window', () => {
    // Exactly 24 hours out belongs to stage 2, not stage 1.
    expect(stageAt(24 * HOUR)).toBe(2);
    expect(stageAt(24 * HOUR + 1)).toBe(1);
    expect(stageAt(3 * HOUR)).toBe(3);
    expect(stageAt(30 * MINUTE)).toBe(4);
  });

  it('does not bark at a low-importance item merely because time passed', () => {
    // Low importance halves the windows and applies a -1 stage bias.
    expect(stageAt(29 * MINUTE, { importance: 'low' as Importance })).toBeLessThan(4);
  });

  it('escalates a critical item one step sooner', () => {
    const normal = stageAt(2 * HOUR, { importance: 'normal' as Importance });
    const critical = stageAt(2 * HOUR, { importance: 'critical' as Importance });
    expect(critical).toBeGreaterThan(normal);
  });

  it('respects reminder intensity in both directions', () => {
    const gentle = stageAt(2 * HOUR, { reminderIntensity: 'gentle' as ReminderIntensity });
    const standard = stageAt(2 * HOUR, { reminderIntensity: 'standard' as ReminderIntensity });
    const firm = stageAt(2 * HOUR, { reminderIntensity: 'firm' as ReminderIntensity });
    expect(gentle).toBeLessThan(standard);
    expect(firm).toBeGreaterThan(standard);
  });

  it('never escalates a Project without a deadline on time alone', () => {
    const { dog, responsibility } = fixture({ deadlineAt: null });
    const result = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    expect(result.stage).toBe(0);
    expect(result.reasons.join(' ')).toMatch(/no deadline/i);
  });

  it('reports a next evaluation time while calm', () => {
    const { dog, responsibility } = fixture({
      deadlineAt: new Date(NOW + 10 * DAY).toISOString(),
    });
    const result = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    expect(result.nextEvaluationAt).not.toBeNull();
    expect(Date.parse(result.nextEvaluationAt!)).toBeGreaterThan(NOW);
  });
});

describe('snoozing', () => {
  it('holds a far-off Project at stage 2 after two snoozes', () => {
    expect(stageAt(10 * DAY, { snoozeCount: 2 })).toBe(2);
  });

  it('holds a far-off Project at stage 3 after three snoozes', () => {
    expect(stageAt(10 * DAY, { snoozeCount: 3 })).toBe(3);
  });

  it('explains the snooze count deterministically', () => {
    const { dog, responsibility } = fixture({
      deadlineAt: new Date(NOW + 10 * DAY).toISOString(),
      snoozeCount: 3,
    });
    const result = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    expect(result.reasons.join(' ')).toMatch(/snoozed 3 times/i);
  });

  it('is not progress: a snooze never lowers a deadline-driven stage', () => {
    const withoutSnooze = stageAt(2 * HOUR);
    const withSnooze = stageAt(2 * HOUR, { snoozeCount: 3 });
    expect(withSnooze).toBeGreaterThanOrEqual(withoutSnooze);
  });

  it('suppresses to the ceiling while an explicit commitment is still in the future', () => {
    const { dog, responsibility } = fixture({
      deadlineAt: new Date(NOW + 2 * HOUR).toISOString(),
      status: 'snoozed',
      nextCommitmentAt: new Date(NOW + 90 * MINUTE).toISOString(),
      snoozeCount: 1,
    });
    const result = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    expect(result.stage).toBeLessThanOrEqual(1);
    expect(result.reasons.join(' ')).toMatch(/Snoozed until/);
  });

  it('resumes escalating once the commitment time has passed', () => {
    const { dog, responsibility } = fixture({
      deadlineAt: new Date(NOW + 20 * MINUTE).toISOString(),
      status: 'snoozed',
      nextCommitmentAt: new Date(NOW - 5 * MINUTE).toISOString(),
      snoozeCount: 1,
    });
    const result = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    expect(result.stage).toBe(4);
    expect(result.reasons.join(' ')).toMatch(/commitment .* has passed/i);
  });
});

describe('statuses and classes that stay quiet', () => {
  it('a completed responsibility is silent', () => {
    const result = (() => {
      const { dog, responsibility } = fixture({
        deadlineAt: new Date(NOW - 5 * DAY).toISOString(),
        status: 'completed',
      });
      return evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    })();
    expect(result.stage).toBe(0);
    expect(result.shouldNotify).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/complete/i);
  });

  it('a dormant responsibility stays quiet until reactivated', () => {
    const { dog, responsibility } = fixture({
      deadlineAt: new Date(NOW - 5 * DAY).toISOString(),
      status: 'dormant',
    });
    const result = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    expect(result.stage).toBe(0);
    expect(result.reasons.join(' ')).toMatch(/dormant/i);
  });

  it('a Resource never escalates on its own', () => {
    const { dog, responsibility } = fixture({
      paraClass: 'resource',
      expectedAttentionIntervalMinutes: 60,
      lastAttentionAt: new Date(NOW - 100 * DAY).toISOString(),
    });
    const result = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    expect(result.stage).toBe(0);
    expect(result.reasons.join(' ')).toMatch(/Resources stay valuable without nagging/i);
  });

  it('an Archive remains retrievable without alerting', () => {
    const { dog, responsibility } = fixture({
      paraClass: 'archive',
      deadlineAt: new Date(NOW - 100 * DAY).toISOString(),
    });
    const result = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    expect(result.stage).toBe(0);
    expect(result.shouldNotify).toBe(false);
  });
});

describe('notifications', () => {
  const overdue = () =>
    fixture({ deadlineAt: new Date(NOW - HOUR).toISOString() });

  it('only stage 4 raises a notification', () => {
    const { dog, responsibility } = fixture({
      deadlineAt: new Date(NOW + 2 * HOUR).toISOString(),
    });
    const result = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    expect(result.stage).toBe(3);
    expect(result.shouldNotify).toBe(false);
  });

  it('a stage-4 dog notifies outside quiet hours', () => {
    const { dog, responsibility } = overdue();
    const result = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    expect(result.shouldNotify).toBe(true);
    expect(result.notificationUrgency).toBe('normal');
  });

  it('quiet hours suppress delivery but not the visible stage', () => {
    const { dog, responsibility } = overdue();
    const result = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 23 });
    expect(result.stage).toBe(4);
    expect(result.shouldNotify).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/Quiet hours are active/);
  });

  it('a recent notification is suppressed by the cooldown', () => {
    const { dog, responsibility } = overdue();
    const result = evaluateResponsibility(dog, responsibility, {
      now: NOW,
      localHour: 12,
      notificationHistory: { [responsibility.id]: NOW - 10 * MINUTE },
    });
    expect(result.shouldNotify).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/cooldown/i);
  });

  it('allows a notification once the cooldown has expired', () => {
    const { dog, responsibility } = overdue();
    const result = evaluateResponsibility(dog, responsibility, {
      now: NOW,
      localHour: 12,
      notificationHistory: { [responsibility.id]: NOW - 2 * HOUR },
    });
    expect(result.shouldNotify).toBe(true);
  });

  it('marks a critical obligation as high urgency', () => {
    const { dog, responsibility } = fixture({
      deadlineAt: new Date(NOW - HOUR).toISOString(),
      importance: 'critical',
    });
    const result = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    expect(result.notificationUrgency).toBe('high');
  });
});

describe('quiet hours arithmetic', () => {
  it('handles a window that wraps past midnight', () => {
    const quiet = { enabled: true, startHour: 22, endHour: 7 };
    expect(isWithinQuietHours(23, quiet)).toBe(true);
    expect(isWithinQuietHours(2, quiet)).toBe(true);
    expect(isWithinQuietHours(7, quiet)).toBe(false);
    expect(isWithinQuietHours(12, quiet)).toBe(false);
  });

  it('handles a same-day window', () => {
    const quiet = { enabled: true, startHour: 9, endHour: 17 };
    expect(isWithinQuietHours(10, quiet)).toBe(true);
    expect(isWithinQuietHours(18, quiet)).toBe(false);
  });

  it('is inert when disabled', () => {
    expect(isWithinQuietHours(23, { enabled: false, startHour: 22, endHour: 7 })).toBe(false);
  });
});

describe('determinism', () => {
  it('produces identical output for identical input', () => {
    const { dog, responsibility } = fixture({
      deadlineAt: new Date(NOW + 2 * HOUR).toISOString(),
      snoozeCount: 2,
    });
    const a = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    const b = evaluateResponsibility(dog, responsibility, { now: NOW, localHour: 12 });
    expect(a).toEqual(b);
  });
});
