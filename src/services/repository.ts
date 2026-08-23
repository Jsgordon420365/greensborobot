/**
 * The storage contract shared by Local Demonstration Mode and Connected Mode.
 *
 * Both implementations return the same `HouseholdSnapshot`, evaluated by the
 * same rules package. The only difference is who runs the evaluation: the
 * browser, or the `evaluate-household` Edge Function (which is authoritative).
 */

import type {
  EarnedAccessory,
  Household,
  HouseholdEvent,
  HouseholdSnapshot,
  Nagimal,
  Responsibility,
} from '../domain';
import type { ActionKind } from '../domain';

export interface NagimalsIdentity {
  id: string;
  label: string;
  /** True for the one-click identity used when no auth backend is available. */
  isLocalDemo: boolean;
}

export interface CreateHouseholdInput {
  ownerId: string;
  dogVariant: string;
  dogName: string;
  communicationStyle?: 'calm' | 'encouraging' | 'direct';
}

export interface RecordActionInput {
  responsibilityId: string;
  kind: ActionKind;
  now: number;
  nextCommitmentAt?: string | null;
  note?: string | null;
}

export interface EvaluateInput {
  ownerId: string;
  /** Effective time, including any developer time-simulation offset. */
  now: number;
  localHour?: number;
}

/**
 * A repository owns persistence and evaluation for exactly one user.
 *
 * Implementations must be safe to call before a household exists: `load`
 * returns null rather than throwing.
 */
export interface NagimalsRepository {
  readonly mode: 'local' | 'connected';

  /** Resolve the signed-in identity, or null when nobody is signed in. */
  getIdentity(): Promise<NagimalsIdentity | null>;

  /** Sign in. Local mode creates a demo identity; connected mode emails a link. */
  signIn(email?: string): Promise<NagimalsIdentity | null>;

  signOut(): Promise<void>;

  /** The household and everything in it, or null when none has been created. */
  load(ownerId: string): Promise<HouseholdSnapshotSource | null>;

  /** Create a household from a shelter adoption, seeded with the demo scenario. */
  createHousehold(input: CreateHouseholdInput): Promise<HouseholdSnapshotSource>;

  /** Insert or update one responsibility. */
  saveResponsibility(responsibility: Responsibility): Promise<void>;

  /** Apply a meaningful action and return the updated canonical state. */
  recordAction(input: RecordActionInput & { ownerId: string }): Promise<HouseholdSnapshot>;

  /** Evaluate the household at the given effective time. */
  evaluate(input: EvaluateInput): Promise<HouseholdSnapshot>;

  /** Recent household events, newest first. */
  listEvents(ownerId: string, limit?: number): Promise<HouseholdEvent[]>;

  /** Record that a notification was delivered, for cooldown accounting. */
  recordNotification(ownerId: string, responsibilityId: string, at: number): Promise<void>;

  /**
   * Watch for changes made elsewhere (another tab, another device).
   * Returns an unsubscribe function. A no-op implementation is acceptable.
   */
  subscribe(ownerId: string, onChange: () => void): () => void;

  /** Remove everything for this owner. Used by the "reset demo" control. */
  reset(ownerId: string): Promise<void>;
}

/** The raw stored shape, before evaluation is applied. */
export interface HouseholdSnapshotSource {
  household: Household;
  nagimals: Nagimal[];
  responsibilities: Responsibility[];
  accessories: EarnedAccessory[];
  notificationHistory: Record<string, number>;
}
