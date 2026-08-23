/**
 * Loading and evaluating a household on the server.
 *
 * The evaluation itself is the *same* pure function the browser runs — imported
 * from the synced copy of `src/domain` — which is why Connected Mode and Local
 * Demonstration Mode can never disagree about what stage something is at.
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { evaluateHousehold } from './domain/index.ts';
import type {
  EarnedAccessory,
  Household,
  Nagimal,
  NagimalEvaluation,
  Responsibility,
} from './domain/index.ts';

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));
const nstr = (v: unknown): string | null => (typeof v === 'string' ? v : null);

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

export function rowToResponsibility(row: Row): Responsibility {
  return {
    id: str(row.id),
    householdId: str(row.household_id),
    ownerId: str(row.owner_id),
    nagimalId: nstr(row.nagimal_id),
    title: str(row.title),
    description: nstr(row.description),
    paraClass: str(row.para_class) as Responsibility['paraClass'],
    status: str(row.status) as Responsibility['status'],
    importance: str(row.importance) as Responsibility['importance'],
    reminderIntensity: str(row.reminder_intensity) as Responsibility['reminderIntensity'],
    deadlineAt: nstr(row.deadline_at),
    expectedAttentionIntervalMinutes:
      row.expected_attention_interval_minutes == null
        ? null
        : Number(row.expected_attention_interval_minutes),
    lastAttentionAt: nstr(row.last_attention_at),
    nextCommitmentAt: nstr(row.next_commitment_at),
    snoozeCount: Number(row.snooze_count ?? 0),
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

export interface LoadedHousehold {
  household: Household;
  householdRow: Row;
  nagimals: Nagimal[];
  nagimalRows: Row[];
  responsibilities: Responsibility[];
  responsibilityRows: Row[];
  accessoryRows: Row[];
  notificationHistory: Record<string, number>;
}

/** Load everything for one owner. Returns null when they have no household. */
export async function loadHousehold(
  client: SupabaseClient,
  ownerId: string,
): Promise<LoadedHousehold | null> {
  const { data: households, error } = await client
    .from('households')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  if (!households || households.length === 0) return null;

  const householdRow = households[0] as Row;
  const householdId = str(householdRow.id);

  const [nagimals, responsibilities, notifications] = await Promise.all([
    client.from('nagimals').select('*').eq('household_id', householdId),
    client.from('responsibilities').select('*').eq('household_id', householdId),
    client
      .from('household_events')
      .select('responsibility_id, created_at')
      .eq('household_id', householdId)
      .eq('event_type', 'notification_sent')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  if (nagimals.error) throw nagimals.error;
  if (responsibilities.error) throw responsibilities.error;

  const nagimalRows = (nagimals.data ?? []) as Row[];
  const nagimalIds = nagimalRows.map((r) => str(r.id));

  const accessories = nagimalIds.length
    ? await client.from('earned_accessories').select('*').in('nagimal_id', nagimalIds)
    : { data: [] as Row[], error: null };
  if (accessories.error) throw accessories.error;

  const notificationHistory: Record<string, number> = {};
  for (const row of (notifications.data ?? []) as Row[]) {
    const id = nstr(row.responsibility_id);
    const at = nstr(row.created_at);
    if (id && at && !(id in notificationHistory)) notificationHistory[id] = Date.parse(at);
  }

  return {
    household: {
      id: householdId,
      ownerId: str(householdRow.owner_id),
      name: str(householdRow.name),
      createdAt: str(householdRow.created_at),
      updatedAt: str(householdRow.updated_at),
    },
    householdRow,
    nagimals: nagimalRows.map(rowToNagimal),
    nagimalRows,
    responsibilities: ((responsibilities.data ?? []) as Row[]).map(rowToResponsibility),
    responsibilityRows: (responsibilities.data ?? []) as Row[],
    accessoryRows: (accessories.data ?? []) as Row[],
    notificationHistory,
  };
}

export interface EvaluatedHousehold {
  loaded: LoadedHousehold;
  evaluations: NagimalEvaluation[];
  evaluatedAt: string;
}

export function evaluate(
  loaded: LoadedHousehold,
  now: number,
  localHour?: number,
): EvaluatedHousehold {
  const evaluations = evaluateHousehold(
    {
      household: loaded.household,
      nagimals: loaded.nagimals,
      responsibilities: loaded.responsibilities,
    },
    { now, localHour, notificationHistory: loaded.notificationHistory },
  );
  return { loaded, evaluations, evaluatedAt: new Date(now).toISOString() };
}

/**
 * Persist a snapshot only when the state has *materially* changed, so the
 * table records transitions rather than every poll.
 */
export async function persistSnapshots(
  client: SupabaseClient,
  evaluations: NagimalEvaluation[],
): Promise<number> {
  let written = 0;

  for (const evaluation of evaluations) {
    const { data: previous } = await client
      .from('nagimal_state_snapshots')
      .select('stage, state, intervening_for')
      .eq('nagimal_id', evaluation.nagimalId)
      .order('evaluated_at', { ascending: false })
      .limit(1);

    const last = previous?.[0] as Row | undefined;
    const unchanged =
      last !== undefined &&
      Number(last.stage) === evaluation.stage &&
      str(last.state) === evaluation.state &&
      nstr(last.intervening_for) === evaluation.interveningFor;
    if (unchanged) continue;

    const { error } = await client.from('nagimal_state_snapshots').insert({
      nagimal_id: evaluation.nagimalId,
      responsibility_id: evaluation.responsibilityId,
      stage: evaluation.stage,
      state: evaluation.state,
      animation: evaluation.animation,
      message: evaluation.message,
      sound: evaluation.sound,
      should_notify: evaluation.shouldNotify,
      intervening_for: evaluation.interveningFor,
      reasons: evaluation.reasons,
      evaluated_at: evaluation.evaluatedAt,
      next_evaluation_at: evaluation.nextEvaluationAt,
    });
    if (!error) written += 1;
  }

  return written;
}

/** The response shape the browser's `hydrateSnapshot` expects. */
export function toResponse(result: EvaluatedHousehold) {
  return {
    household: result.loaded.householdRow,
    nagimals: result.loaded.nagimalRows,
    responsibilities: result.loaded.responsibilityRows,
    accessories: result.loaded.accessoryRows,
    evaluations: result.evaluations,
    evaluatedAt: result.evaluatedAt,
  };
}

export function resolveNow(raw: unknown): number {
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return Date.now();
}

export type { EarnedAccessory, NagimalEvaluation, Responsibility };
