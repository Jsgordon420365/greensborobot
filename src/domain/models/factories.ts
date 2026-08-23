/**
 * Factories for households, Nagimals and responsibilities, plus the seed for
 * the principal demonstration scenario, "The Fern, the Cat and the Deadline".
 *
 * Kept free of browser globals so the Edge Functions can seed with it too.
 */

import type {
  CommunicationStyle,
  Household,
  Nagimal,
  Responsibility,
  Species,
} from './types.ts';
import { DAY, DEFAULT_QUIET_HOURS, HOUR } from '../rules/thresholds.ts';

/** RFC4122-ish v4 id. Uses crypto when available, falls back to Math.random. */
export function newId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface DogCandidate {
  variant: string;
  defaultName: string;
  /** How this dog tends to communicate. A preference, not a personality verdict. */
  communicationStyle: CommunicationStyle;
  description: string;
  /** Visual hints consumed by the procedural renderer. */
  build: 'large' | 'medium' | 'compact';
  coat: string;
  accent: string;
  marking: 'solid' | 'patch' | 'speckled';
  accessory: 'none' | 'bandana' | 'collar_tag';
}

/**
 * The shelter roster. Three visibly distinct dogs, differing in body shape,
 * markings and accessories so the choice is legible at a glance.
 */
export const DOG_CANDIDATES: readonly DogCandidate[] = [
  {
    variant: 'bear',
    defaultName: 'Bear',
    communicationStyle: 'calm',
    description:
      'A large, patient dog. Waits quietly, watches steadily, and only raises his voice when a deadline has genuinely become dangerous.',
    build: 'large',
    coat: '#b98a4e',
    accent: '#7d5a2e',
    marking: 'solid',
    accessory: 'none',
  },
  {
    variant: 'sunny',
    defaultName: 'Sunny',
    communicationStyle: 'encouraging',
    description:
      'A cheerful golden retriever. Frames every reminder as something you are still perfectly capable of finishing.',
    build: 'medium',
    coat: '#e8b95f',
    accent: '#c99433',
    marking: 'patch',
    accessory: 'bandana',
  },
  {
    variant: 'pepper',
    defaultName: 'Pepper',
    communicationStyle: 'direct',
    description:
      'A compact, alert mixed breed. Tells you the plain facts about what is due and when, without softening them.',
    build: 'compact',
    coat: '#4a4a55',
    accent: '#d8d8de',
    marking: 'speckled',
    accessory: 'collar_tag',
  },
] as const;

export function findDogCandidate(variant: string): DogCandidate {
  return DOG_CANDIDATES.find((d) => d.variant === variant) ?? DOG_CANDIDATES[0];
}

export function makeHousehold(ownerId: string, name = 'Home', now = Date.now()): Household {
  const iso = new Date(now).toISOString();
  return { id: newId(), ownerId, name, createdAt: iso, updatedAt: iso };
}

export interface MakeNagimalInput {
  householdId: string;
  ownerId: string;
  name: string;
  species: Species;
  appearanceVariant: string;
  communicationStyle?: CommunicationStyle;
  role: string;
  metadata?: Record<string, unknown>;
  now?: number;
}

const BASE_STATE: Record<Species, Nagimal['baseState']> = {
  dog: 'resting',
  cat: 'lounging',
  plant: 'healthy',
};

export function makeNagimal(input: MakeNagimalInput): Nagimal {
  const iso = new Date(input.now ?? Date.now()).toISOString();
  return {
    id: newId(),
    householdId: input.householdId,
    ownerId: input.ownerId,
    name: input.name,
    species: input.species,
    appearanceVariant: input.appearanceVariant,
    communicationStyle: input.communicationStyle ?? 'calm',
    role: input.role,
    baseState: BASE_STATE[input.species],
    metadata: input.metadata ?? {},
    createdAt: iso,
    updatedAt: iso,
  };
}

export interface MakeResponsibilityInput
  extends Partial<Omit<Responsibility, 'id' | 'createdAt' | 'updatedAt'>> {
  householdId: string;
  ownerId: string;
  title: string;
  now?: number;
}

export function makeResponsibility(input: MakeResponsibilityInput): Responsibility {
  const now = input.now ?? Date.now();
  const iso = new Date(now).toISOString();
  return {
    id: newId(),
    householdId: input.householdId,
    ownerId: input.ownerId,
    nagimalId: input.nagimalId ?? null,
    title: input.title,
    description: input.description ?? null,
    paraClass: input.paraClass ?? 'project',
    status: input.status ?? 'active',
    importance: input.importance ?? 'normal',
    reminderIntensity: input.reminderIntensity ?? 'standard',
    deadlineAt: input.deadlineAt ?? null,
    expectedAttentionIntervalMinutes: input.expectedAttentionIntervalMinutes ?? null,
    lastAttentionAt: input.lastAttentionAt ?? iso,
    nextCommitmentAt: input.nextCommitmentAt ?? null,
    snoozeCount: input.snoozeCount ?? 0,
    quietHours: input.quietHours ?? { ...DEFAULT_QUIET_HOURS },
    createdAt: iso,
    updatedAt: iso,
  };
}

export interface SeedResult {
  household: Household;
  nagimals: Nagimal[];
  responsibilities: Responsibility[];
}

/**
 * "The Fern, the Cat and the Deadline" — the principal demonstration.
 *
 * Bear guards a Project three days out. Juniper watches a weekly Area. Frondly
 * stands for a long-neglected prototype with a seven-day attention interval,
 * already six days stale so that a short simulated jump reaches stage 2.
 */
export function seedDemoHousehold(
  ownerId: string,
  options: { dogVariant?: string; dogName?: string; now?: number } = {},
): SeedResult {
  const now = options.now ?? Date.now();
  const candidate = findDogCandidate(options.dogVariant ?? 'bear');
  const household = makeHousehold(ownerId, 'The Household', now);

  const dog = makeNagimal({
    householdId: household.id,
    ownerId,
    name: options.dogName ?? candidate.defaultName,
    species: 'dog',
    appearanceVariant: candidate.variant,
    communicationStyle: candidate.communicationStyle,
    role: 'deadline guardian',
    now,
  });

  const cat = makeNagimal({
    householdId: household.id,
    ownerId,
    name: 'Juniper',
    species: 'cat',
    appearanceVariant: 'calico',
    communicationStyle: 'direct',
    role: 'persistent attention broker and household intermediary',
    now,
  });

  const fern = makeNagimal({
    householdId: household.id,
    ownerId,
    name: 'Frondly',
    species: 'plant',
    appearanceVariant: 'boston_fern',
    communicationStyle: 'calm',
    role: 'long-term and low-frequency responsibility',
    now,
  });

  const proposal = makeResponsibility({
    householdId: household.id,
    ownerId,
    nagimalId: dog.id,
    title: 'Submit the Nagimals proof-of-concept',
    description:
      'The deliverable Bear is guarding. Three days out at the start of the scenario.',
    paraClass: 'project',
    importance: 'high',
    reminderIntensity: 'standard',
    deadlineAt: new Date(now + 3 * DAY).toISOString(),
    lastAttentionAt: new Date(now - 2 * HOUR).toISOString(),
    now,
  });

  const review = makeResponsibility({
    householdId: household.id,
    ownerId,
    nagimalId: cat.id,
    title: 'Weekly project review',
    description: 'An ongoing Area with no completion state. Juniper keeps an eye on it.',
    paraClass: 'area',
    importance: 'normal',
    reminderIntensity: 'gentle',
    expectedAttentionIntervalMinutes: 7 * 24 * 60,
    lastAttentionAt: new Date(now - 1 * DAY).toISOString(),
    now,
  });

  // Six days stale against a seven-day interval: calm now, drooping soon.
  const prototypeNotes = makeResponsibility({
    householdId: household.id,
    ownerId,
    nagimalId: fern.id,
    title: 'Revisit the neglected prototype notes',
    description:
      'The shipwreck at the bottom of the sea. Frondly stands for it so it stays visible.',
    paraClass: 'area',
    importance: 'normal',
    reminderIntensity: 'standard',
    expectedAttentionIntervalMinutes: 7 * 24 * 60,
    lastAttentionAt: new Date(now - 6 * DAY).toISOString(),
    now,
  });

  return {
    household,
    nagimals: [dog, cat, fern],
    responsibilities: [proposal, review, prototypeNotes],
  };
}
