/**
 * Meaningful actions a user can take on a responsibility.
 *
 * Like the evaluator, these are pure transformations. They return the updated
 * responsibility plus the events and accessories the action earns, so the
 * browser and the `record-action` Edge Function apply identical semantics.
 */

import type {
  EarnedAccessory,
  HouseholdEvent,
  HouseholdEventType,
  Responsibility,
} from '../models/types.ts';
import { SNOOZES_FORGIVEN_PER_ATTENTION } from './thresholds.ts';

export type ActionKind =
  | 'attended'
  | 'completed'
  | 'snoozed'
  | 'dormant'
  | 'converted_to_resource'
  | 'archived'
  | 'reactivated';

export interface ActionInput {
  kind: ActionKind;
  now: number;
  /** Required for `snoozed`: the explicit new commitment the user makes. */
  nextCommitmentAt?: string | null;
  /** Optional free-text note stored on the resulting event. */
  note?: string | null;
}

export interface ActionOutcome {
  responsibility: Responsibility;
  event: Omit<HouseholdEvent, 'id'>;
  /** Accessories earned by this action, without ids. */
  accessories: Array<Omit<EarnedAccessory, 'id'>>;
}

const EVENT_TYPE: Record<ActionKind, HouseholdEventType> = {
  attended: 'attended',
  completed: 'completed',
  snoozed: 'snoozed',
  dormant: 'dormant',
  converted_to_resource: 'converted_to_resource',
  archived: 'archived',
  reactivated: 'reactivated',
};

/**
 * Accessories are small, permanent keepsakes. A Nagimal never changes species,
 * never "levels up" into another creature, and never dies.
 */
export function accessoryForCompletion(snoozeCount: number): {
  key: string;
  reason: string;
} {
  if (snoozeCount === 0) {
    return {
      key: 'gold_star_pin',
      reason: 'Finished without a single snooze.',
    };
  }
  if (snoozeCount <= 2) {
    return { key: 'blue_bandana', reason: 'Finished after a couple of deferrals.' };
  }
  return {
    key: 'brass_collar_charm',
    reason: `Finished after ${snoozeCount} snoozes — persistence counts.`,
  };
}

export function applyAction(
  responsibility: Responsibility,
  input: ActionInput,
): ActionOutcome {
  const nowIso = new Date(input.now).toISOString();
  const next: Responsibility = { ...responsibility, updatedAt: nowIso };
  const accessories: Array<Omit<EarnedAccessory, 'id'>> = [];
  const payload: Record<string, unknown> = {};
  if (input.note) payload.note = input.note;

  switch (input.kind) {
    case 'attended': {
      next.lastAttentionAt = nowIso;
      next.status = 'active';
      next.nextCommitmentAt = null;
      next.snoozeCount = Math.max(
        0,
        responsibility.snoozeCount - SNOOZES_FORGIVEN_PER_ATTENTION,
      );
      payload.previousSnoozeCount = responsibility.snoozeCount;
      break;
    }

    case 'completed': {
      next.status = 'completed';
      next.lastAttentionAt = nowIso;
      next.nextCommitmentAt = null;
      payload.snoozeCountAtCompletion = responsibility.snoozeCount;
      if (responsibility.nagimalId) {
        const earned = accessoryForCompletion(responsibility.snoozeCount);
        accessories.push({
          nagimalId: responsibility.nagimalId,
          accessoryKey: earned.key,
          earnedReason: `${earned.reason} ("${responsibility.title}")`,
          earnedAt: nowIso,
          equipped: true,
        });
      }
      break;
    }

    case 'snoozed': {
      // A snooze is a deferral, not progress: lastAttentionAt is untouched.
      next.status = 'snoozed';
      next.snoozeCount = responsibility.snoozeCount + 1;
      next.nextCommitmentAt = input.nextCommitmentAt ?? null;
      payload.snoozeCount = next.snoozeCount;
      payload.nextCommitmentAt = next.nextCommitmentAt;
      break;
    }

    case 'dormant': {
      next.status = 'dormant';
      next.nextCommitmentAt = null;
      break;
    }

    case 'converted_to_resource': {
      next.paraClass = 'resource';
      next.status = 'active';
      next.deadlineAt = null;
      next.nextCommitmentAt = null;
      break;
    }

    case 'archived': {
      next.status = 'archived';
      next.paraClass = 'archive';
      next.nextCommitmentAt = null;
      break;
    }

    case 'reactivated': {
      next.status = 'active';
      next.nextCommitmentAt = null;
      if (responsibility.paraClass === 'archive') next.paraClass = 'project';
      break;
    }
  }

  return {
    responsibility: next,
    event: {
      householdId: responsibility.householdId,
      ownerId: responsibility.ownerId,
      nagimalId: responsibility.nagimalId,
      responsibilityId: responsibility.id,
      eventType: EVENT_TYPE[input.kind],
      eventPayload: payload,
      createdAt: nowIso,
    },
    accessories,
  };
}

/** Human-readable label used on buttons and in event lists. */
export const ACTION_LABELS: Record<ActionKind, string> = {
  attended: 'Mark attended',
  completed: 'Complete',
  snoozed: 'Snooze',
  dormant: 'Move to dormant',
  converted_to_resource: 'Convert to Resource',
  archived: 'Archive',
  reactivated: 'Reactivate',
};

export const ACCESSORY_LABELS: Record<string, string> = {
  gold_star_pin: 'Gold star pin',
  blue_bandana: 'Blue bandana',
  brass_collar_charm: 'Brass collar charm',
  green_ribbon: 'Green ribbon',
};
