/**
 * Local Demonstration Mode storage.
 *
 * Persists to IndexedDB when it is available and falls back to localStorage
 * otherwise, so the demo survives a reload in every environment we target
 * (including jsdom under test, and private browsing modes that disable IDB).
 *
 * Evaluation uses the same pure rules package as the server, which is what
 * lets the two modes stay in step.
 */

import { openDB, type IDBPDatabase } from 'idb';
import {
  applyAction,
  buildSnapshot,
  findDogCandidate,
  newId,
  seedDemoHousehold,
} from '../domain';
import type {
  EarnedAccessory,
  HouseholdEvent,
  HouseholdSnapshot,
  Responsibility,
} from '../domain';
import { describeError, logger } from '../lib/logger';
import type {
  CreateHouseholdInput,
  EvaluateInput,
  HouseholdSnapshotSource,
  NagimalsIdentity,
  NagimalsRepository,
  RecordActionInput,
} from './repository';

const DB_NAME = 'nagimals';
const DB_VERSION = 1;
const STORE = 'households';
const IDENTITY_KEY = 'nagimals.identity';
const FALLBACK_PREFIX = 'nagimals.household.';
const CHANGE_EVENT = 'nagimals:local-change';

interface StoredHousehold extends HouseholdSnapshotSource {
  events: HouseholdEvent[];
}

let dbPromise: Promise<IDBPDatabase | null> | null = null;

async function getDb(): Promise<IDBPDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      },
    }).catch((error) => {
      logger.warn('storage.read', 'IndexedDB unavailable, falling back to localStorage', {
        ...describeError(error),
      });
      return null;
    });
  }
  return dbPromise;
}

async function readStored(ownerId: string): Promise<StoredHousehold | null> {
  const db = await getDb();
  if (db) {
    const value = (await db.get(STORE, ownerId)) as StoredHousehold | undefined;
    if (value) return value;
  }
  try {
    const raw = localStorage.getItem(FALLBACK_PREFIX + ownerId);
    return raw ? (JSON.parse(raw) as StoredHousehold) : null;
  } catch (error) {
    logger.warn('storage.read', 'Could not read the local household', describeError(error));
    return null;
  }
}

async function writeStored(ownerId: string, value: StoredHousehold): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.put(STORE, value, ownerId);
  }
  try {
    localStorage.setItem(FALLBACK_PREFIX + ownerId, JSON.stringify(value));
  } catch (error) {
    logger.warn('storage.write', 'Could not mirror the household to localStorage', describeError(error));
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { ownerId } }));
  }
}

function toSource(stored: StoredHousehold): HouseholdSnapshotSource {
  return {
    household: stored.household,
    nagimals: stored.nagimals,
    responsibilities: stored.responsibilities,
    accessories: stored.accessories,
    notificationHistory: stored.notificationHistory ?? {},
  };
}

export class LocalRepository implements NagimalsRepository {
  readonly mode = 'local' as const;

  async getIdentity(): Promise<NagimalsIdentity | null> {
    try {
      const raw = localStorage.getItem(IDENTITY_KEY);
      return raw ? (JSON.parse(raw) as NagimalsIdentity) : null;
    } catch {
      return null;
    }
  }

  async signIn(): Promise<NagimalsIdentity> {
    const existing = await this.getIdentity();
    if (existing) return existing;
    const identity: NagimalsIdentity = {
      id: `local-${newId()}`,
      label: 'Local demo resident',
      isLocalDemo: true,
    };
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    logger.info('auth.signin', 'Created a one-click local demo identity', {
      ownerId: identity.id,
      mode: 'local',
    });
    return identity;
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(IDENTITY_KEY);
    logger.info('auth.signout', 'Cleared the local demo identity', { mode: 'local' });
  }

  async load(ownerId: string): Promise<HouseholdSnapshotSource | null> {
    const stored = await readStored(ownerId);
    if (!stored) return null;
    logger.debug('household.load', 'Loaded the household from local storage', {
      ownerId,
      nagimals: stored.nagimals.length,
      responsibilities: stored.responsibilities.length,
    });
    return toSource(stored);
  }

  async createHousehold(input: CreateHouseholdInput): Promise<HouseholdSnapshotSource> {
    const now = Date.now();
    const candidate = findDogCandidate(input.dogVariant);
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

    const stored: StoredHousehold = {
      ...seed,
      accessories: [],
      notificationHistory: {},
      events: [
        {
          id: newId(),
          householdId: seed.household.id,
          ownerId: input.ownerId,
          nagimalId: null,
          responsibilityId: null,
          eventType: 'household_created',
          eventPayload: { dogVariant: candidate.variant, dogName: input.dogName },
          createdAt: new Date(now).toISOString(),
        },
        ...seed.nagimals.map((n) => ({
          id: newId(),
          householdId: seed.household.id,
          ownerId: input.ownerId,
          nagimalId: n.id,
          responsibilityId: null,
          eventType: 'nagimal_adopted' as const,
          eventPayload: { name: n.name, species: n.species },
          createdAt: new Date(now).toISOString(),
        })),
      ],
    };

    await writeStored(input.ownerId, stored);
    logger.info('household.create', 'Created a local household', {
      ownerId: input.ownerId,
      dogVariant: candidate.variant,
      nagimals: stored.nagimals.length,
    });
    return toSource(stored);
  }

  async saveResponsibility(responsibility: Responsibility): Promise<void> {
    const stored = await readStored(responsibility.ownerId);
    if (!stored) throw new Error('No household to save this responsibility into.');

    const index = stored.responsibilities.findIndex((r) => r.id === responsibility.id);
    const isNew = index === -1;
    if (isNew) stored.responsibilities.push(responsibility);
    else stored.responsibilities[index] = responsibility;

    stored.events.unshift({
      id: newId(),
      householdId: responsibility.householdId,
      ownerId: responsibility.ownerId,
      nagimalId: responsibility.nagimalId,
      responsibilityId: responsibility.id,
      eventType: isNew ? 'responsibility_created' : 'responsibility_updated',
      eventPayload: { title: responsibility.title, paraClass: responsibility.paraClass },
      createdAt: new Date().toISOString(),
    });

    await writeStored(responsibility.ownerId, stored);
    logger.info('storage.write', isNew ? 'Created a responsibility' : 'Updated a responsibility', {
      ownerId: responsibility.ownerId,
      responsibilityId: responsibility.id,
      paraClass: responsibility.paraClass,
    });
  }

  async recordAction(
    input: RecordActionInput & { ownerId: string },
  ): Promise<HouseholdSnapshot> {
    const stored = await readStored(input.ownerId);
    if (!stored) throw new Error('No household to act on.');

    const responsibility = stored.responsibilities.find((r) => r.id === input.responsibilityId);
    if (!responsibility) throw new Error('That responsibility does not exist.');

    const outcome = applyAction(responsibility, {
      kind: input.kind,
      now: input.now,
      nextCommitmentAt: input.nextCommitmentAt,
      note: input.note,
    });

    stored.responsibilities = stored.responsibilities.map((r) =>
      r.id === responsibility.id ? outcome.responsibility : r,
    );
    stored.events.unshift({ ...outcome.event, id: newId() });

    for (const accessory of outcome.accessories) {
      const already = stored.accessories.some(
        (a) => a.nagimalId === accessory.nagimalId && a.accessoryKey === accessory.accessoryKey,
      );
      if (already) continue;
      const record: EarnedAccessory = { ...accessory, id: newId() };
      stored.accessories.push(record);
      stored.events.unshift({
        id: newId(),
        householdId: stored.household.id,
        ownerId: input.ownerId,
        nagimalId: accessory.nagimalId,
        responsibilityId: responsibility.id,
        eventType: 'accessory_earned',
        eventPayload: { accessoryKey: accessory.accessoryKey, reason: accessory.earnedReason },
        createdAt: accessory.earnedAt,
      });
    }

    await writeStored(input.ownerId, stored);
    logger.info('action.record', `Recorded a "${input.kind}" action`, {
      ownerId: input.ownerId,
      responsibilityId: input.responsibilityId,
      kind: input.kind,
      accessoriesEarned: outcome.accessories.length,
    });

    return this.evaluate({ ownerId: input.ownerId, now: input.now });
  }

  async evaluate(input: EvaluateInput): Promise<HouseholdSnapshot> {
    const stored = await readStored(input.ownerId);
    if (!stored) throw new Error('No household to evaluate.');

    const snapshot = buildSnapshot(
      {
        household: stored.household,
        nagimals: stored.nagimals,
        responsibilities: stored.responsibilities,
      },
      {
        now: input.now,
        localHour: input.localHour,
        notificationHistory: stored.notificationHistory ?? {},
      },
      { accessories: stored.accessories, source: 'local' },
    );

    logger.debug('rules.evaluate', 'Evaluated the household locally', {
      ownerId: input.ownerId,
      stages: snapshot.evaluations.map((e) => `${e.state}:${e.stage}`),
    });
    return snapshot;
  }

  async listEvents(ownerId: string, limit = 50): Promise<HouseholdEvent[]> {
    const stored = await readStored(ownerId);
    return (stored?.events ?? []).slice(0, limit);
  }

  async recordNotification(ownerId: string, responsibilityId: string, at: number): Promise<void> {
    const stored = await readStored(ownerId);
    if (!stored) return;
    stored.notificationHistory = { ...stored.notificationHistory, [responsibilityId]: at };
    stored.events.unshift({
      id: newId(),
      householdId: stored.household.id,
      ownerId,
      nagimalId: null,
      responsibilityId,
      eventType: 'notification_sent',
      eventPayload: { at: new Date(at).toISOString(), transport: 'local-preview' },
      createdAt: new Date(at).toISOString(),
    });
    await writeStored(ownerId, stored);
  }

  subscribe(ownerId: string, onChange: () => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const onLocal = (event: Event) => {
      const detail = (event as CustomEvent<{ ownerId: string }>).detail;
      if (detail?.ownerId === ownerId) onChange();
    };
    // `storage` fires in *other* tabs, which is exactly the cross-tab case.
    const onStorage = (event: StorageEvent) => {
      if (event.key === FALLBACK_PREFIX + ownerId) {
        logger.debug('realtime.change', 'Another tab changed the household', { ownerId });
        onChange();
      }
    };

    window.addEventListener(CHANGE_EVENT, onLocal);
    window.addEventListener('storage', onStorage);
    logger.debug('realtime.subscribe', 'Watching local storage for changes', { ownerId });

    return () => {
      window.removeEventListener(CHANGE_EVENT, onLocal);
      window.removeEventListener('storage', onStorage);
    };
  }

  async reset(ownerId: string): Promise<void> {
    const db = await getDb();
    if (db) await db.delete(STORE, ownerId);
    localStorage.removeItem(FALLBACK_PREFIX + ownerId);
    logger.info('storage.write', 'Reset the local household', { ownerId });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { ownerId } }));
    }
  }
}
