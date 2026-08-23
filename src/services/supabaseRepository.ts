/**
 * Connected Mode storage.
 *
 * The server is authoritative: `evaluate` and `recordAction` call Edge
 * Functions rather than evaluating in the browser, so two devices signed into
 * the same account always agree. If a Function is unreachable we fall back to
 * evaluating the *same* rules package locally over server-loaded rows, which
 * keeps the interface usable and is labelled as such in the returned snapshot.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { applyAction, buildSnapshot, newId, seedDemoHousehold } from '../domain';
import type {
  EarnedAccessory,
  Household,
  HouseholdEvent,
  HouseholdSnapshot,
  Nagimal,
  NagimalEvaluation,
  Responsibility,
} from '../domain';
import { getSupabaseClient } from '../lib/supabase/client';
import {
  nagimalToRow,
  responsibilityToRow,
  rowToAccessory,
  rowToEvent,
  rowToHousehold,
  rowToNagimal,
  rowToResponsibility,
} from '../lib/supabase/mappers';
import { describeError, logger } from '../lib/logger';
import { readEnv } from '../lib/env';
import type {
  CreateHouseholdInput,
  EvaluateInput,
  HouseholdSnapshotSource,
  NagimalsIdentity,
  NagimalsRepository,
  RecordActionInput,
} from './repository';

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      'Connected Mode needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to be set.',
    );
  }
  return client;
}

export class SupabaseRepository implements NagimalsRepository {
  readonly mode = 'connected' as const;

  async getIdentity(): Promise<NagimalsIdentity | null> {
    const client = requireClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    logger.debug('auth.session', 'Restored an authenticated session', { ownerId: data.user.id });
    return {
      id: data.user.id,
      label: data.user.email ?? 'Signed in',
      isLocalDemo: false,
    };
  }

  /** Sends a magic link. Returns null: the identity arrives after the redirect. */
  async signIn(email?: string): Promise<NagimalsIdentity | null> {
    if (!email) throw new Error('An email address is required to send a magic link.');
    const client = requireClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: readEnv().appUrl },
    });
    if (error) {
      logger.error('auth.signin', 'Magic link request failed', describeError(error));
      throw error;
    }
    logger.info('auth.signin', 'Sent a magic link', { transport: 'email' });
    return null;
  }

  async signOut(): Promise<void> {
    await requireClient().auth.signOut();
    logger.info('auth.signout', 'Signed out of Connected Mode', {});
  }

  async load(ownerId: string): Promise<HouseholdSnapshotSource | null> {
    const client = requireClient();

    const { data: households, error } = await client
      .from('households')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) throw error;
    if (!households || households.length === 0) return null;

    const household: Household = rowToHousehold(households[0]);

    const [nagimalsRes, responsibilitiesRes, accessoriesRes, notificationsRes] =
      await Promise.all([
        client.from('nagimals').select('*').eq('household_id', household.id),
        client.from('responsibilities').select('*').eq('household_id', household.id),
        client.from('earned_accessories').select('*'),
        client
          .from('household_events')
          .select('responsibility_id, created_at')
          .eq('household_id', household.id)
          .eq('event_type', 'notification_sent')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

    if (nagimalsRes.error) throw nagimalsRes.error;
    if (responsibilitiesRes.error) throw responsibilitiesRes.error;

    const nagimals: Nagimal[] = (nagimalsRes.data ?? []).map(rowToNagimal);
    const responsibilities: Responsibility[] = (responsibilitiesRes.data ?? []).map(
      rowToResponsibility,
    );
    const nagimalIds = new Set(nagimals.map((n) => n.id));
    const accessories: EarnedAccessory[] = (accessoriesRes.data ?? [])
      .map(rowToAccessory)
      .filter((a) => nagimalIds.has(a.nagimalId));

    const notificationHistory: Record<string, number> = {};
    for (const row of notificationsRes.data ?? []) {
      const id = (row as Record<string, unknown>).responsibility_id;
      const at = (row as Record<string, unknown>).created_at;
      if (typeof id === 'string' && typeof at === 'string' && !(id in notificationHistory)) {
        notificationHistory[id] = Date.parse(at);
      }
    }

    logger.info('household.load', 'Loaded the household from Supabase', {
      ownerId,
      householdId: household.id,
      nagimals: nagimals.length,
      responsibilities: responsibilities.length,
    });

    return { household, nagimals, responsibilities, accessories, notificationHistory };
  }

  async createHousehold(input: CreateHouseholdInput): Promise<HouseholdSnapshotSource> {
    const client = requireClient();
    const now = Date.now();
    const seed = seedDemoHousehold(input.ownerId, {
      dogVariant: input.dogVariant,
      dogName: input.dogName,
      now,
    });
    if (input.communicationStyle) {
      seed.nagimals = seed.nagimals.map((n) =>
        n.species === 'dog' ? { ...n, communicationStyle: input.communicationStyle! } : n,
      );
    }

    const householdInsert = await client.from('households').insert({
      id: seed.household.id,
      owner_id: input.ownerId,
      name: seed.household.name,
    });
    if (householdInsert.error) throw householdInsert.error;

    const nagimalInsert = await client.from('nagimals').insert(seed.nagimals.map(nagimalToRow));
    if (nagimalInsert.error) throw nagimalInsert.error;

    const responsibilityInsert = await client
      .from('responsibilities')
      .insert(seed.responsibilities.map(responsibilityToRow));
    if (responsibilityInsert.error) throw responsibilityInsert.error;

    await client.from('household_events').insert({
      household_id: seed.household.id,
      owner_id: input.ownerId,
      event_type: 'household_created',
      event_payload: { dogVariant: input.dogVariant, dogName: input.dogName },
    });

    logger.info('household.create', 'Created a household in Supabase', {
      ownerId: input.ownerId,
      householdId: seed.household.id,
    });

    return {
      household: seed.household,
      nagimals: seed.nagimals,
      responsibilities: seed.responsibilities,
      accessories: [],
      notificationHistory: {},
    };
  }

  async saveResponsibility(responsibility: Responsibility): Promise<void> {
    const client = requireClient();
    const { error } = await client
      .from('responsibilities')
      .upsert(responsibilityToRow(responsibility));
    if (error) throw error;
    logger.info('storage.write', 'Saved a responsibility to Supabase', {
      responsibilityId: responsibility.id,
      paraClass: responsibility.paraClass,
    });
  }

  /** Calls `record-action`, which validates ownership and re-evaluates server-side. */
  async recordAction(
    input: RecordActionInput & { ownerId: string },
  ): Promise<HouseholdSnapshot> {
    const client = requireClient();
    const { data, error } = await client.functions.invoke('record-action', {
      body: {
        responsibilityId: input.responsibilityId,
        kind: input.kind,
        now: new Date(input.now).toISOString(),
        nextCommitmentAt: input.nextCommitmentAt ?? null,
        note: input.note ?? null,
      },
    });

    if (error) {
      logger.warn('action.record', 'record-action failed; applying locally instead', {
        ...describeError(error),
        responsibilityId: input.responsibilityId,
      });
      return this.fallbackAction(input);
    }

    logger.info('action.record', 'Recorded an action through the Edge Function', {
      ownerId: input.ownerId,
      kind: input.kind,
      responsibilityId: input.responsibilityId,
    });
    return this.hydrateSnapshot(data as ServerSnapshot, input.ownerId);
  }

  async evaluate(input: EvaluateInput): Promise<HouseholdSnapshot> {
    const client = requireClient();
    const { data, error } = await client.functions.invoke('evaluate-household', {
      body: { now: new Date(input.now).toISOString(), localHour: input.localHour },
    });

    if (error) {
      logger.warn('rules.evaluate', 'evaluate-household failed; evaluating locally', {
        ...describeError(error),
      });
      return this.fallbackEvaluate(input);
    }

    logger.debug('rules.evaluate', 'Evaluated the household on the server', {
      ownerId: input.ownerId,
    });
    return this.hydrateSnapshot(data as ServerSnapshot, input.ownerId);
  }

  /**
   * Reconstruct a snapshot from the Function response. The Function returns
   * evaluations plus rows; we map rows through the same mappers as `load`.
   */
  private async hydrateSnapshot(
    payload: ServerSnapshot,
    ownerId: string,
  ): Promise<HouseholdSnapshot> {
    if (!payload || !payload.household) return this.fallbackEvaluate({ ownerId, now: Date.now() });
    return {
      household: rowToHousehold(payload.household),
      nagimals: (payload.nagimals ?? []).map(rowToNagimal),
      responsibilities: (payload.responsibilities ?? []).map(rowToResponsibility),
      evaluations: payload.evaluations ?? [],
      accessories: (payload.accessories ?? []).map(rowToAccessory),
      evaluatedAt: payload.evaluatedAt ?? new Date().toISOString(),
      source: 'server',
    };
  }

  /** Evaluate the identical rules package in the browser over server rows. */
  private async fallbackEvaluate(input: EvaluateInput): Promise<HouseholdSnapshot> {
    const source = await this.load(input.ownerId);
    if (!source) throw new Error('No household to evaluate.');
    return buildSnapshot(
      {
        household: source.household,
        nagimals: source.nagimals,
        responsibilities: source.responsibilities,
      },
      {
        now: input.now,
        localHour: input.localHour,
        notificationHistory: source.notificationHistory,
      },
      { accessories: source.accessories, source: 'local' },
    );
  }

  private async fallbackAction(
    input: RecordActionInput & { ownerId: string },
  ): Promise<HouseholdSnapshot> {
    const client = requireClient();
    const source = await this.load(input.ownerId);
    if (!source) throw new Error('No household to act on.');

    const responsibility = source.responsibilities.find((r) => r.id === input.responsibilityId);
    if (!responsibility) throw new Error('That responsibility does not exist.');

    const outcome = applyAction(responsibility, {
      kind: input.kind,
      now: input.now,
      nextCommitmentAt: input.nextCommitmentAt,
      note: input.note,
    });

    await client.from('responsibilities').upsert(responsibilityToRow(outcome.responsibility));
    await client.from('household_events').insert({
      household_id: outcome.event.householdId,
      owner_id: outcome.event.ownerId,
      nagimal_id: outcome.event.nagimalId,
      responsibility_id: outcome.event.responsibilityId,
      event_type: outcome.event.eventType,
      event_payload: outcome.event.eventPayload,
    });
    for (const accessory of outcome.accessories) {
      await client.from('earned_accessories').insert({
        id: newId(),
        nagimal_id: accessory.nagimalId,
        accessory_key: accessory.accessoryKey,
        earned_reason: accessory.earnedReason,
        equipped: accessory.equipped,
      });
    }

    return this.fallbackEvaluate({ ownerId: input.ownerId, now: input.now });
  }

  async listEvents(ownerId: string, limit = 50): Promise<HouseholdEvent[]> {
    const client = requireClient();
    const { data, error } = await client
      .from('household_events')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(rowToEvent);
  }

  async recordNotification(
    ownerId: string,
    responsibilityId: string,
    at: number,
  ): Promise<void> {
    const client = requireClient();
    const source = await this.load(ownerId);
    if (!source) return;
    await client.from('household_events').insert({
      household_id: source.household.id,
      owner_id: ownerId,
      responsibility_id: responsibilityId,
      event_type: 'notification_sent',
      event_payload: { at: new Date(at).toISOString(), transport: 'web-push' },
    });
  }

  /**
   * Realtime: an action taken in one session repaints every other open session.
   * The returned function removes the channel, which callers must do on unmount.
   */
  subscribe(ownerId: string, onChange: () => void): () => void {
    const client = getSupabaseClient();
    if (!client) return () => {};

    const channel = client
      .channel(`nagimals-${ownerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'responsibilities', filter: `owner_id=eq.${ownerId}` },
        () => {
          logger.debug('realtime.change', 'A responsibility changed', { ownerId });
          onChange();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nagimal_state_snapshots' },
        () => {
          logger.debug('realtime.change', 'A state snapshot was written', { ownerId });
          onChange();
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'earned_accessories' },
        () => {
          logger.debug('realtime.change', 'An accessory was earned', { ownerId });
          onChange();
        },
      )
      .subscribe();

    logger.info('realtime.subscribe', 'Subscribed to household changes', { ownerId });

    return () => {
      void client.removeChannel(channel);
      logger.debug('realtime.subscribe', 'Removed the realtime channel', { ownerId });
    };
  }

  async reset(ownerId: string): Promise<void> {
    const client = requireClient();
    const source = await this.load(ownerId);
    if (!source) return;
    await client.from('households').delete().eq('id', source.household.id);
    logger.info('storage.write', 'Deleted the household from Supabase', { ownerId });
  }
}

interface ServerSnapshot {
  household: Record<string, unknown>;
  nagimals: Record<string, unknown>[];
  responsibilities: Record<string, unknown>[];
  accessories: Record<string, unknown>[];
  evaluations: NagimalEvaluation[];
  evaluatedAt: string;
}
