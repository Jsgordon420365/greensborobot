/**
 * Core domain vocabulary for Nagimals.
 *
 * These types are shared verbatim between the browser (Local Demonstration Mode)
 * and the Supabase Edge Functions (Connected Mode). Nothing in this file may
 * import from React, Three.js, Supabase or any browser-only global.
 */

export type Species = 'dog' | 'cat' | 'plant';

/** PARA-style responsibility classification. */
export type ParaClass = 'project' | 'area' | 'resource' | 'archive';

export type Importance = 'low' | 'normal' | 'high' | 'critical';

export type ReminderIntensity = 'gentle' | 'standard' | 'firm';

export type ResponsibilityStatus =
  | 'active'
  | 'snoozed'
  | 'completed'
  | 'dormant'
  | 'archived';

/**
 * How the household member phrases itself. This is a *communication preference*
 * chosen by the user, never an inferred psychological trait or diagnosis.
 */
export type CommunicationStyle = 'calm' | 'encouraging' | 'direct';

/** Escalation stage. 0 is calm, 4 is the loudest state the species allows. */
export type Stage = 0 | 1 | 2 | 3 | 4;

export type DogState =
  | 'resting'
  | 'attentive'
  | 'whining'
  | 'nudging'
  | 'barking';

export type CatState =
  | 'lounging'
  | 'slow_blink'
  | 'staring'
  | 'pawing'
  | 'knocking_things_over'
  | 'intervening_for_plant'
  | 'intervening_for_dog';

export type PlantState =
  | 'healthy'
  | 'dulling'
  | 'drooping'
  | 'wilted'
  | 'severely_wilted';

export type NagimalState = DogState | CatState | PlantState;

export type NotificationUrgency = 'none' | 'low' | 'normal' | 'high';

export interface QuietHours {
  /** Local hour (0-23) at which quiet hours begin. */
  startHour: number;
  /** Local hour (0-23) at which quiet hours end. May wrap past midnight. */
  endHour: number;
  enabled: boolean;
}

export interface Nagimal {
  id: string;
  householdId: string;
  ownerId: string;
  name: string;
  species: Species;
  /** Which visual variant to render, e.g. 'bear' | 'sunny' | 'pepper'. */
  appearanceVariant: string;
  communicationStyle: CommunicationStyle;
  /** Free-text role description, e.g. 'deadline guardian'. */
  role: string;
  /** State the Nagimal falls back to when it has nothing to watch over. */
  baseState: NagimalState;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Responsibility {
  id: string;
  householdId: string;
  ownerId: string;
  /** The household member that watches over this responsibility. */
  nagimalId: string | null;
  title: string;
  description: string | null;
  paraClass: ParaClass;
  status: ResponsibilityStatus;
  importance: Importance;
  reminderIntensity: ReminderIntensity;
  /** ISO timestamp. Projects normally have one; Areas normally do not. */
  deadlineAt: string | null;
  /** How often an Area / plant expects to be attended, in minutes. */
  expectedAttentionIntervalMinutes: number | null;
  /** ISO timestamp of the last *intentional* attention event. */
  lastAttentionAt: string | null;
  /** ISO timestamp the user explicitly committed to when snoozing. */
  nextCommitmentAt: string | null;
  snoozeCount: number;
  quietHours: QuietHours | null;
  createdAt: string;
  updatedAt: string;
}

export interface EarnedAccessory {
  id: string;
  nagimalId: string;
  accessoryKey: string;
  earnedReason: string;
  earnedAt: string;
  equipped: boolean;
}

export interface Household {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type HouseholdEventType =
  | 'household_created'
  | 'nagimal_adopted'
  | 'responsibility_created'
  | 'responsibility_updated'
  | 'attended'
  | 'completed'
  | 'snoozed'
  | 'dormant'
  | 'converted_to_resource'
  | 'archived'
  | 'reactivated'
  | 'accessory_earned'
  | 'notification_sent';

export interface HouseholdEvent {
  id: string;
  householdId: string;
  ownerId: string;
  nagimalId: string | null;
  responsibilityId: string | null;
  eventType: HouseholdEventType;
  eventPayload: Record<string, unknown>;
  createdAt: string;
}

/** Normalized result of evaluating one responsibility against its Nagimal. */
export interface EvaluationResult {
  nagimalId: string;
  responsibilityId: string | null;
  stage: Stage;
  state: NagimalState;
  animation: string;
  message: string;
  sound: string | null;
  shouldNotify: boolean;
  notificationUrgency: NotificationUrgency;
  /** Set when this Nagimal is acting on behalf of a different one. */
  interveningFor: string | null;
  /** ISO timestamp of the evaluation. */
  evaluatedAt: string;
  /** ISO timestamp at which the next threshold boundary would be crossed. */
  nextEvaluationAt: string | null;
  /** Deterministic, human-readable explanations. Never model-generated. */
  reasons: string[];
}

/** The per-Nagimal rollup returned by `evaluateHousehold`. */
export interface NagimalEvaluation extends EvaluationResult {
  /** Every responsibility this Nagimal watches, most urgent first. */
  perResponsibility: EvaluationResult[];
}

export interface HouseholdSnapshot {
  household: Household;
  nagimals: Nagimal[];
  responsibilities: Responsibility[];
  evaluations: NagimalEvaluation[];
  accessories: EarnedAccessory[];
  /** ISO timestamp the snapshot was produced. */
  evaluatedAt: string;
  /** Which mode produced this snapshot. */
  source: 'local' | 'server';
}

export interface PushSubscriptionRecord {
  id: string;
  ownerId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

export interface NagimalsPushPayload {
  title: string;
  body: string;
  icon: string;
  badge: string;
  nagimalId: string;
  responsibilityId: string | null;
  stage: Stage;
  state: NagimalState;
  deepLink: string;
  soundKey: string | null;
  eventId: string;
}
