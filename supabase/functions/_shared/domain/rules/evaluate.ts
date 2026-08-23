// GENERATED FILE — do not edit.
// Copied verbatim from src/domain by scripts/sync-edge-domain.mjs.
// Edit the original and run `npm run sync:edge`.
/**
 * The deterministic escalation engine.
 *
 * `evaluateResponsibility` is a pure function of its inputs. Given the same
 * arguments it always returns the same stage, the same reasons and the same
 * `nextEvaluationAt`. Local Demonstration Mode and the `evaluate-household`
 * Edge Function both call it, which is why the two modes cannot drift apart.
 */

import type {
  EvaluationResult,
  Household,
  HouseholdSnapshot,
  Nagimal,
  NagimalEvaluation,
  NotificationUrgency,
  QuietHours,
  Responsibility,
  Stage,
} from '../models/types.ts';
import { describeAnimation, messageFor, stateForStage } from './states.ts';
import {
  CAT_INTERVENTION_DOG_STAGE,
  CAT_INTERVENTION_DOG_STAGES,
  CAT_INTERVENTION_GRACE_MS,
  CAT_INTERVENTION_PLANT_STAGE,
  CAT_INTERVENTION_STAGE,
  DEFAULT_QUIET_HOURS,
  NEGLECT_RATIOS,
  NOTIFICATION_COOLDOWN_MS,
  NOTIFY_AT_STAGE,
  PROJECT_ATTENTION_GRACE_MS,
  SNOOZE_STAGE_FLOOR,
  SNOOZE_SUPPRESSION_CEILING,
  clampStage,
  effectiveDeadlineWindow,
  effectiveNeglectInterval,
  stageBias,
} from './thresholds.ts';

export interface EvaluateOptions {
  /** Effective "now" in epoch milliseconds. Callers pass simulated time here. */
  now: number;
  /** Epoch ms of the last notification per responsibility id. */
  notificationHistory?: Record<string, number>;
  /** Overrides the quiet-hours window used when a responsibility defines none. */
  defaultQuietHours?: QuietHours;
  /**
   * Local hour (0-23) to test quiet hours against. Defaults to the hour of
   * `now` in the host timezone. Tests pass it explicitly to stay deterministic.
   */
  localHour?: number;
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? null : value;
}

function formatDuration(deltaMs: number): string {
  const abs = Math.abs(deltaMs);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(abs / 3_600_000);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(abs / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** True when `hour` falls inside the (possibly midnight-wrapping) window. */
export function isWithinQuietHours(hour: number, quiet: QuietHours): boolean {
  if (!quiet.enabled) return false;
  const { startHour, endHour } = quiet;
  if (startHour === endHour) return false;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

function calmResult(
  nagimal: Nagimal,
  responsibility: Responsibility | null,
  now: number,
  reasons: string[],
): EvaluationResult {
  const stage: Stage = 0;
  const state = stateForStage(nagimal.species, stage);
  const descriptor = describeAnimation(nagimal.species, state, stage);
  return {
    nagimalId: nagimal.id,
    responsibilityId: responsibility?.id ?? null,
    stage,
    state,
    animation: descriptor.animation,
    message: messageFor(
      nagimal.species,
      stage,
      nagimal.name,
      responsibility?.title ?? null,
      nagimal.communicationStyle,
    ),
    sound: null,
    shouldNotify: false,
    notificationUrgency: 'none',
    interveningFor: null,
    evaluatedAt: new Date(now).toISOString(),
    nextEvaluationAt: null,
    reasons,
  };
}

interface RawStage {
  stage: Stage;
  reasons: string[];
  /** Epoch ms of the next boundary crossing, if one is computable. */
  nextBoundary: number | null;
}

/** Stage derived purely from a Project's deadline. */
function stageFromDeadline(
  responsibility: Responsibility,
  now: number,
): RawStage {
  const deadline = ms(responsibility.deadlineAt);
  const reasons: string[] = [];

  if (deadline === null) {
    reasons.push('This Project has no deadline, so it cannot escalate on time alone.');
    return { stage: 0, reasons, nextBoundary: null };
  }

  const remaining = deadline - now;
  const { importance, reminderIntensity } = responsibility;

  if (remaining <= 0) {
    reasons.push(`The deadline passed ${formatDuration(remaining)} ago.`);
    return { stage: 4, reasons, nextBoundary: null };
  }

  let stage: Stage = 0;
  let nextBoundary: number | null = null;

  for (const candidate of [4, 3, 2, 1] as const) {
    const windowMs = effectiveDeadlineWindow(candidate, importance, reminderIntensity);
    if (remaining <= windowMs) {
      stage = candidate;
      reasons.push(
        `The deadline is ${formatDuration(remaining)} away, inside the ${formatDuration(windowMs)} window for stage ${candidate}.`,
      );
      break;
    }
    nextBoundary = deadline - windowMs;
  }

  if (stage === 0) {
    reasons.push(`The deadline is ${formatDuration(remaining)} away and nothing is pressing.`);
  } else {
    // The next boundary is the entry into the stage above the current one.
    const above = (stage + 1) as Exclude<Stage, 0>;
    nextBoundary =
      stage < 4
        ? deadline - effectiveDeadlineWindow(above, importance, reminderIntensity)
        : deadline;
  }

  return { stage, reasons, nextBoundary };
}

/** Stage derived from how long an Area or plant has gone unattended. */
function stageFromNeglect(
  responsibility: Responsibility,
  now: number,
): RawStage {
  const reasons: string[] = [];
  const intervalMinutes = responsibility.expectedAttentionIntervalMinutes;

  if (!intervalMinutes || intervalMinutes <= 0) {
    reasons.push('No expected attention interval is set, so neglect cannot be measured.');
    return { stage: 0, reasons, nextBoundary: null };
  }

  const since = ms(responsibility.lastAttentionAt) ?? ms(responsibility.createdAt) ?? now;
  const elapsed = now - since;
  const interval = effectiveNeglectInterval(
    intervalMinutes,
    responsibility.importance,
    responsibility.reminderIntensity,
  );
  const ratio = elapsed / interval;

  let stage: Stage = 0;
  for (const candidate of [4, 3, 2, 1] as const) {
    if (ratio >= NEGLECT_RATIOS[candidate]) {
      stage = candidate;
      break;
    }
  }

  if (stage === 0) {
    reasons.push(
      `Last attended ${formatDuration(elapsed)} ago, within its ${formatDuration(interval)} interval.`,
    );
  } else {
    const multiple = NEGLECT_RATIOS[stage as Exclude<Stage, 0>];
    reasons.push(
      multiple === 1
        ? `It has received no attention for longer than its ${formatDuration(interval)} expected interval.`
        : `It has received no attention for ${multiple} times its ${formatDuration(interval)} expected interval.`,
    );
  }

  const nextStage = stage < 4 ? ((stage + 1) as Exclude<Stage, 0>) : null;
  const nextBoundary =
    nextStage === null ? null : since + NEGLECT_RATIOS[nextStage] * interval;

  return { stage, reasons, nextBoundary };
}

/**
 * Evaluate a single responsibility against the Nagimal that watches it.
 *
 * Pure. No clock reads, no randomness, no I/O.
 */
export function evaluateResponsibility(
  nagimal: Nagimal,
  responsibility: Responsibility,
  options: EvaluateOptions,
): EvaluationResult {
  const { now } = options;
  const reasons: string[] = [];

  // ---- statuses that silence a responsibility outright -------------------
  if (responsibility.status === 'completed') {
    return calmResult(nagimal, responsibility, now, [
      `"${responsibility.title}" is complete. Nothing to watch.`,
    ]);
  }
  if (responsibility.status === 'archived') {
    return calmResult(nagimal, responsibility, now, [
      `"${responsibility.title}" is archived and remains retrievable without alerting.`,
    ]);
  }
  if (responsibility.status === 'dormant') {
    return calmResult(nagimal, responsibility, now, [
      `"${responsibility.title}" is dormant and stays quiet until it is reactivated.`,
    ]);
  }

  // ---- classes that never escalate on their own --------------------------
  if (responsibility.paraClass === 'resource') {
    return calmResult(nagimal, responsibility, now, [
      `"${responsibility.title}" is a Resource. Resources stay valuable without nagging.`,
    ]);
  }
  if (responsibility.paraClass === 'archive') {
    return calmResult(nagimal, responsibility, now, [
      `"${responsibility.title}" is an Archive. Archives never raise alerts.`,
    ]);
  }

  // ---- raw stage from the class-appropriate rule -------------------------
  const raw =
    responsibility.paraClass === 'project'
      ? stageFromDeadline(responsibility, now)
      : stageFromNeglect(responsibility, now);

  reasons.push(...raw.reasons);
  let stage: Stage = raw.stage;
  let nextBoundary = raw.nextBoundary;

  // ---- snooze floors: a snooze is not progress ---------------------------
  if (responsibility.snoozeCount > 0) {
    let floor: Stage = 0;
    for (const rule of SNOOZE_STAGE_FLOOR) {
      if (responsibility.snoozeCount >= rule.count) floor = rule.stage;
    }
    if (floor > stage) {
      reasons.push(
        `This reminder has been snoozed ${responsibility.snoozeCount} time${responsibility.snoozeCount === 1 ? '' : 's'}, holding it at stage ${floor}.`,
      );
      stage = floor;
    } else if (floor > 0) {
      reasons.push(
        `This reminder has been snoozed ${responsibility.snoozeCount} time${responsibility.snoozeCount === 1 ? '' : 's'}.`,
      );
    }
  }

  // ---- importance and intensity bias -------------------------------------
  if (stage >= 1) {
    const bias = stageBias(responsibility.importance, responsibility.reminderIntensity);
    if (bias !== 0) {
      const biased = clampStage(stage + bias);
      if (biased !== stage) {
        reasons.push(
          bias > 0
            ? `${responsibility.importance} importance and ${responsibility.reminderIntensity} reminders raise this to stage ${biased}.`
            : `${responsibility.importance} importance and ${responsibility.reminderIntensity} reminders hold this down to stage ${biased}.`,
        );
        stage = biased;
      }
    }
  }

  // ---- a recent, intentional check-in calms a Project --------------------
  const lastAttention = ms(responsibility.lastAttentionAt);
  if (
    responsibility.paraClass === 'project' &&
    lastAttention !== null &&
    now - lastAttention < PROJECT_ATTENTION_GRACE_MS &&
    stage > 0 &&
    stage < 4
  ) {
    const calmed = clampStage(stage - 1);
    reasons.push(
      `You checked in ${formatDuration(now - lastAttention)} ago, which settles this to stage ${calmed}.`,
    );
    stage = calmed;
  }

  // ---- an explicit snooze commitment suppresses until it expires ---------
  const commitment = ms(responsibility.nextCommitmentAt);
  if (responsibility.status === 'snoozed' && commitment !== null && commitment > now) {
    if (stage > SNOOZE_SUPPRESSION_CEILING) {
      reasons.push(
        `Snoozed until ${new Date(commitment).toISOString()}, so it is held at stage ${SNOOZE_SUPPRESSION_CEILING} for now.`,
      );
      stage = SNOOZE_SUPPRESSION_CEILING;
    }
    nextBoundary = nextBoundary === null ? commitment : Math.min(nextBoundary, commitment);
  } else if (responsibility.status === 'snoozed' && commitment !== null) {
    reasons.push(`The snooze commitment of ${new Date(commitment).toISOString()} has passed.`);
  }

  // ---- notification decision ---------------------------------------------
  const quiet = responsibility.quietHours ?? options.defaultQuietHours ?? DEFAULT_QUIET_HOURS;
  const localHour = options.localHour ?? new Date(now).getHours();
  let shouldNotify = stage >= NOTIFY_AT_STAGE && nagimal.species !== 'plant';
  let urgency: NotificationUrgency = 'none';

  if (nagimal.species === 'plant' && stage >= NOTIFY_AT_STAGE) {
    reasons.push('Plants never raise notifications directly; the cat speaks for them.');
  }

  if (shouldNotify) {
    if (isWithinQuietHours(localHour, quiet)) {
      shouldNotify = false;
      reasons.push(
        `Quiet hours are active (${String(quiet.startHour).padStart(2, '0')}:00 to ${String(quiet.endHour).padStart(2, '0')}:00), so the notification is suppressed.`,
      );
    } else {
      const last = options.notificationHistory?.[responsibility.id];
      if (last !== undefined && now - last < NOTIFICATION_COOLDOWN_MS) {
        shouldNotify = false;
        reasons.push(
          `A notification was already sent ${formatDuration(now - last)} ago, inside the ${formatDuration(NOTIFICATION_COOLDOWN_MS)} cooldown.`,
        );
      } else {
        urgency = responsibility.importance === 'critical' ? 'high' : 'normal';
      }
    }
  }

  const state = stateForStage(nagimal.species, stage);
  const descriptor = describeAnimation(nagimal.species, state, stage);

  return {
    nagimalId: nagimal.id,
    responsibilityId: responsibility.id,
    stage,
    state,
    animation: descriptor.animation,
    message: messageFor(
      nagimal.species,
      stage,
      nagimal.name,
      responsibility.title,
      nagimal.communicationStyle,
    ),
    sound: descriptor.soundKey,
    shouldNotify,
    notificationUrgency: urgency,
    interveningFor: null,
    evaluatedAt: new Date(now).toISOString(),
    nextEvaluationAt:
      nextBoundary !== null && nextBoundary > now ? new Date(nextBoundary).toISOString() : null,
    reasons,
  };
}

/**
 * The moment a plant crossed into the stage at which the cat starts to care.
 * Returns null when the plant is not there yet or the data does not allow it.
 */
export function plantInterventionThresholdCrossedAt(
  responsibility: Responsibility,
): number | null {
  const intervalMinutes = responsibility.expectedAttentionIntervalMinutes;
  if (!intervalMinutes || intervalMinutes <= 0) return null;
  const since = ms(responsibility.lastAttentionAt) ?? ms(responsibility.createdAt);
  if (since === null) return null;
  const interval = effectiveNeglectInterval(
    intervalMinutes,
    responsibility.importance,
    responsibility.reminderIntensity,
  );
  return since + NEGLECT_RATIOS[CAT_INTERVENTION_PLANT_STAGE as Exclude<Stage, 0>] * interval;
}

export interface HouseholdInput {
  household: Household;
  nagimals: Nagimal[];
  responsibilities: Responsibility[];
}

/**
 * Evaluate every responsibility, roll the results up per Nagimal, then apply
 * the cross-entity rules that make the household behave as one household
 * rather than three unrelated notification widgets.
 */
export function evaluateHousehold(
  input: HouseholdInput,
  options: EvaluateOptions,
): NagimalEvaluation[] {
  const { now } = options;
  const byNagimal = new Map<string, EvaluationResult[]>();

  for (const nagimal of input.nagimals) byNagimal.set(nagimal.id, []);

  for (const responsibility of input.responsibilities) {
    if (!responsibility.nagimalId) continue;
    const nagimal = input.nagimals.find((n) => n.id === responsibility.nagimalId);
    if (!nagimal) continue;
    const bucket = byNagimal.get(nagimal.id);
    if (!bucket) continue;
    bucket.push(evaluateResponsibility(nagimal, responsibility, options));
  }

  const evaluations: NagimalEvaluation[] = input.nagimals.map((nagimal) => {
    const results = (byNagimal.get(nagimal.id) ?? [])
      .slice()
      .sort((a, b) => b.stage - a.stage);

    if (results.length === 0) {
      const calm = calmResult(nagimal, null, now, [
        `${nagimal.name} has nothing assigned and is simply at home.`,
      ]);
      return { ...calm, perResponsibility: [] };
    }

    const top = results[0];
    return { ...top, perResponsibility: results };
  });

  applyCrossEntityRules(evaluations, input, options);
  return evaluations;
}

/**
 * Cross-entity intervention. The cat is the household's attention broker: it
 * escalates on behalf of the fern, and gives the dog a hand before the dog has
 * to bark. It never overrides a more urgent state of its own.
 */
function applyCrossEntityRules(
  evaluations: NagimalEvaluation[],
  input: HouseholdInput,
  options: EvaluateOptions,
): void {
  const { now } = options;
  const cat = input.nagimals.find((n) => n.species === 'cat');
  if (!cat) return;
  const catEval = evaluations.find((e) => e.nagimalId === cat.id);
  if (!catEval) return;

  // --- rule 1: the fern has been neglected past the grace period ----------
  const plants = input.nagimals.filter((n) => n.species === 'plant');
  for (const plant of plants) {
    const plantEval = evaluations.find((e) => e.nagimalId === plant.id);
    if (!plantEval || plantEval.stage < CAT_INTERVENTION_PLANT_STAGE) continue;

    const responsibility = input.responsibilities.find(
      (r) => r.id === plantEval.responsibilityId,
    );
    if (!responsibility) continue;

    const crossedAt = plantInterventionThresholdCrossedAt(responsibility);
    if (crossedAt === null) continue;

    const sustainedFor = now - crossedAt;
    if (sustainedFor < CAT_INTERVENTION_GRACE_MS) {
      catEval.reasons.push(
        `${plant.name} reached stage ${plantEval.stage} ${formatDuration(sustainedFor)} ago; ${cat.name} waits ${formatDuration(CAT_INTERVENTION_GRACE_MS)} before stepping in.`,
      );
      continue;
    }

    if (catEval.stage > CAT_INTERVENTION_STAGE) {
      catEval.reasons.push(
        `${cat.name} already has a more urgent problem than ${plant.name}.`,
      );
      continue;
    }

    const stage = CAT_INTERVENTION_STAGE;
    const descriptor = describeAnimation('cat', 'intervening_for_plant', stage);
    catEval.stage = stage;
    catEval.state = 'intervening_for_plant';
    catEval.animation = descriptor.animation;
    catEval.sound = descriptor.soundKey;
    catEval.interveningFor = plant.id;
    catEval.message = messageFor(
      'cat',
      stage,
      cat.name,
      responsibility.title,
      cat.communicationStyle,
      plant.name,
    );
    catEval.reasons.push(
      `${cat.name} is intervening because ${plant.name} reached stage ${plantEval.stage} and has stayed there for ${formatDuration(sustainedFor)}.`,
    );
    return;
  }

  // --- rule 2: the dog is waiting but has not reached bark level ----------
  const dogs = input.nagimals.filter((n) => n.species === 'dog');
  for (const dog of dogs) {
    const dogEval = evaluations.find((e) => e.nagimalId === dog.id);
    if (!dogEval) continue;
    if (!CAT_INTERVENTION_DOG_STAGES.includes(dogEval.stage)) continue;
    if (catEval.stage >= CAT_INTERVENTION_DOG_STAGE) {
      catEval.reasons.push(`${cat.name} is already at least as concerned as ${dog.name}.`);
      continue;
    }

    const stage = CAT_INTERVENTION_DOG_STAGE;
    const descriptor = describeAnimation('cat', 'intervening_for_dog', stage);
    catEval.stage = stage;
    catEval.state = 'intervening_for_dog';
    catEval.animation = descriptor.animation;
    catEval.sound = descriptor.soundKey;
    catEval.interveningFor = dog.id;
    catEval.message = messageFor(
      'cat',
      stage,
      cat.name,
      dogEval.responsibilityId
        ? (input.responsibilities.find((r) => r.id === dogEval.responsibilityId)?.title ?? null)
        : null,
      cat.communicationStyle,
      dog.name,
    );
    catEval.reasons.push(
      `${cat.name} is stepping in because ${dog.name} is at stage ${dogEval.stage} and still waiting on you.`,
    );
    return;
  }
}

/** Convenience wrapper that produces a full snapshot for the UI. */
export function buildSnapshot(
  input: HouseholdInput,
  options: EvaluateOptions,
  extras: { accessories: HouseholdSnapshot['accessories']; source: HouseholdSnapshot['source'] },
): HouseholdSnapshot {
  return {
    household: input.household,
    nagimals: input.nagimals,
    responsibilities: input.responsibilities,
    evaluations: evaluateHousehold(input, options),
    accessories: extras.accessories,
    evaluatedAt: new Date(options.now).toISOString(),
    source: extras.source,
  };
}
