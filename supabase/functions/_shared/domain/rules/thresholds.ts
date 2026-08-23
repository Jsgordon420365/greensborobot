// GENERATED FILE — do not edit.
// Copied verbatim from src/domain by scripts/sync-edge-domain.mjs.
// Edit the original and run `npm run sync:edge`.
/**
 * Every tunable number in the Nagimals escalation engine lives in this file.
 *
 * Urgency is decided here by arithmetic, never by a generative model. If you
 * want to change how loud the household gets, change these constants and the
 * unit tests in `src/test/rules.*.test.ts` will tell you exactly what moved.
 */

import type { Importance, ReminderIntensity, Stage } from '../models/types.ts';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Base "time remaining before deadline" windows for a Project, in milliseconds.
 * A Project sits at the highest stage whose window it has entered.
 */
export const PROJECT_DEADLINE_WINDOWS: Record<Exclude<Stage, 0>, number> = {
  1: 72 * HOUR,
  2: 24 * HOUR,
  3: 3 * HOUR,
  4: 30 * MINUTE,
};

/**
 * Snooze counts that pin a Project to a minimum stage regardless of how far
 * away the deadline is. A snooze is not progress.
 */
export const SNOOZE_STAGE_FLOOR: ReadonlyArray<{ count: number; stage: Stage }> = [
  { count: 2, stage: 2 },
  { count: 3, stage: 3 },
];

/**
 * Neglect ratios for Areas and plants. `ratio` is
 * `elapsedSinceLastAttention / effectiveInterval`.
 */
export const NEGLECT_RATIOS: Record<Exclude<Stage, 0>, number> = {
  1: 1.0,
  2: 1.5,
  3: 2.0,
  4: 3.0,
};

/**
 * Widens or narrows the deadline windows above. A higher multiplier means the
 * dog notices *earlier*, because the window it is watching is larger.
 */
export const IMPORTANCE_WINDOW_MULTIPLIER: Record<Importance, number> = {
  low: 0.5,
  normal: 1.0,
  high: 1.5,
  critical: 2.0,
};

export const INTENSITY_WINDOW_MULTIPLIER: Record<ReminderIntensity, number> = {
  gentle: 0.6,
  standard: 1.0,
  firm: 1.4,
};

/**
 * Scales the *tolerated* neglect interval for Areas and plants. A tolerance
 * above 1 means the fern is given more slack before it starts to droop.
 */
export const IMPORTANCE_NEGLECT_TOLERANCE: Record<Importance, number> = {
  low: 1.5,
  normal: 1.0,
  high: 0.75,
  critical: 0.5,
};

export const INTENSITY_NEGLECT_TOLERANCE: Record<ReminderIntensity, number> = {
  gentle: 1.4,
  standard: 1.0,
  firm: 0.75,
};

/**
 * Applied *after* a raw stage has been derived, and only when that raw stage is
 * already 1 or higher. This is what keeps the dog from barking at a
 * low-priority errand simply because time has passed, while still letting a
 * critical obligation escalate one step sooner.
 */
export const IMPORTANCE_STAGE_BIAS: Record<Importance, number> = {
  low: -1,
  normal: 0,
  high: 0,
  critical: 1,
};

export const INTENSITY_STAGE_BIAS: Record<ReminderIntensity, number> = {
  gentle: -1,
  standard: 0,
  firm: 1,
};

/**
 * A snoozed responsibility is held at or below this stage until the explicit
 * commitment time the user chose has passed.
 */
export const SNOOZE_SUPPRESSION_CEILING: Stage = 1;

/**
 * How long a plant must sit at stage 3 or higher before the cat decides the
 * situation is its problem too.
 */
export const CAT_INTERVENTION_GRACE_MS = 12 * HOUR;

/** The plant stage at or above which the cat may intervene on its behalf. */
export const CAT_INTERVENTION_PLANT_STAGE: Stage = 3;

/** The stage the cat adopts when it starts making a scene for the plant. */
export const CAT_INTERVENTION_STAGE: Stage = 3;

/**
 * The dog stages that count as "waiting on the user but not yet barking",
 * which the cat may escalate on the dog's behalf.
 */
export const CAT_INTERVENTION_DOG_STAGES: ReadonlyArray<Stage> = [2, 3];

/** The stage the cat adopts when it nudges you about the dog. */
export const CAT_INTERVENTION_DOG_STAGE: Stage = 2;

/** Minimum gap between two stage-4 notifications for the same responsibility. */
export const NOTIFICATION_COOLDOWN_MS = 60 * MINUTE;

/** The only stage that is permitted to raise a push notification. */
export const NOTIFY_AT_STAGE: Stage = 4;

/** Default quiet hours applied when a responsibility does not define its own. */
export const DEFAULT_QUIET_HOURS = {
  enabled: true,
  startHour: 22,
  endHour: 7,
} as const;

/**
 * Attending an Area or plant resets its neglect clock outright. Attending a
 * Project instead forgives this many snoozes, so that a genuine check-in
 * calms the dog without erasing a long history of deferral.
 */
export const SNOOZES_FORGIVEN_PER_ATTENTION = 1;

/** How long a plain "mark attended" holds a Project's stage down. */
export const PROJECT_ATTENTION_GRACE_MS = 6 * HOUR;

export const DEFAULT_EXPECTED_INTERVAL_MINUTES = 7 * 24 * 60;

/** Clamp a possibly out-of-range number into a valid Stage. */
export function clampStage(value: number): Stage {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  if (rounded <= 0) return 0;
  if (rounded >= 4) return 4;
  return rounded as Stage;
}

/** Effective deadline window for a given stage, after user preferences. */
export function effectiveDeadlineWindow(
  stage: Exclude<Stage, 0>,
  importance: Importance,
  intensity: ReminderIntensity,
): number {
  return (
    PROJECT_DEADLINE_WINDOWS[stage] *
    IMPORTANCE_WINDOW_MULTIPLIER[importance] *
    INTENSITY_WINDOW_MULTIPLIER[intensity]
  );
}

/** Effective neglect interval, after user preferences. */
export function effectiveNeglectInterval(
  intervalMinutes: number,
  importance: Importance,
  intensity: ReminderIntensity,
): number {
  return (
    intervalMinutes *
    MINUTE *
    IMPORTANCE_NEGLECT_TOLERANCE[importance] *
    INTENSITY_NEGLECT_TOLERANCE[intensity]
  );
}

/** Combined stage bias from importance and reminder intensity. */
export function stageBias(
  importance: Importance,
  intensity: ReminderIntensity,
): number {
  return IMPORTANCE_STAGE_BIAS[importance] + INTENSITY_STAGE_BIAS[intensity];
}
