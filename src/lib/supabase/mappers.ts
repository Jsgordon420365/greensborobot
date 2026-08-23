/**
 * Translation between Postgres snake_case rows and the camelCase domain model.
 *
 * Keeping this in one file means a column rename touches exactly one place.
 */

import type {
  EarnedAccessory,
  Household,
  HouseholdEvent,
  Nagimal,
  Responsibility,
} from '../../domain';

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));
const nullableStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' ? v : Number(v ?? fallback) || fallback;

export function rowToHousehold(row: Row): Household {
  return {
    id: str(row.id),
    ownerId: str(row.owner_id),
    name: str(row.name),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function rowToNagimal(row: Row): Nagimal {
  return {
    id: str(row.id),
    householdId: str(row.household_id),
    ownerId: str(row.owner_id),
    name: str(row.name),
    species: str(row.species) as Nagimal['species'],
    appearanceVariant: str(row.appearance_variant),
    communicationStyle: str(row.communication_style) as Nagimal['communicationStyle'],
    role: str(row.role),
    baseState: str(row.base_state) as Nagimal['baseState'],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function nagimalToRow(n: Nagimal): Row {
  return {
    id: n.id,
    household_id: n.householdId,
    owner_id: n.ownerId,
    name: n.name,
    species: n.species,
    appearance_variant: n.appearanceVariant,
    communication_style: n.communicationStyle,
    role: n.role,
    base_state: n.baseState,
    metadata: n.metadata,
  };
}

export function rowToResponsibility(row: Row): Responsibility {
  return {
    id: str(row.id),
    householdId: str(row.household_id),
    ownerId: str(row.owner_id),
    nagimalId: nullableStr(row.nagimal_id),
    title: str(row.title),
    description: nullableStr(row.description),
    paraClass: str(row.para_class) as Responsibility['paraClass'],
    status: str(row.status) as Responsibility['status'],
    importance: str(row.importance) as Responsibility['importance'],
    reminderIntensity: str(row.reminder_intensity) as Responsibility['reminderIntensity'],
    deadlineAt: nullableStr(row.deadline_at),
    expectedAttentionIntervalMinutes:
      row.expected_attention_interval_minutes === null ||
      row.expected_attention_interval_minutes === undefined
        ? null
        : num(row.expected_attention_interval_minutes),
    lastAttentionAt: nullableStr(row.last_attention_at),
    nextCommitmentAt: nullableStr(row.next_commitment_at),
    snoozeCount: num(row.snooze_count),
    quietHours: (row.quiet_hours as Responsibility['quietHours']) ?? null,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function responsibilityToRow(r: Responsibility): Row {
  return {
    id: r.id,
    household_id: r.householdId,
    owner_id: r.ownerId,
    nagimal_id: r.nagimalId,
    title: r.title,
    description: r.description,
    para_class: r.paraClass,
    status: r.status,
    importance: r.importance,
    reminder_intensity: r.reminderIntensity,
    deadline_at: r.deadlineAt,
    expected_attention_interval_minutes: r.expectedAttentionIntervalMinutes,
    last_attention_at: r.lastAttentionAt,
    next_commitment_at: r.nextCommitmentAt,
    snooze_count: r.snoozeCount,
    quiet_hours: r.quietHours,
  };
}

export function rowToAccessory(row: Row): EarnedAccessory {
  return {
    id: str(row.id),
    nagimalId: str(row.nagimal_id),
    accessoryKey: str(row.accessory_key),
    earnedReason: str(row.earned_reason),
    earnedAt: str(row.earned_at),
    equipped: Boolean(row.equipped),
  };
}

export function rowToEvent(row: Row): HouseholdEvent {
  return {
    id: str(row.id),
    householdId: str(row.household_id),
    ownerId: str(row.owner_id),
    nagimalId: nullableStr(row.nagimal_id),
    responsibilityId: nullableStr(row.responsibility_id),
    eventType: str(row.event_type) as HouseholdEvent['eventType'],
    eventPayload: (row.event_payload as Record<string, unknown>) ?? {},
    createdAt: str(row.created_at),
  };
}
