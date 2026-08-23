/**
 * The single mapping between a normalized escalation stage and everything the
 * presentation layer needs: state name, animation key, sound key, loop and
 * movement behaviour, and a fallback visual effect for renderers that cannot
 * play the animation.
 *
 * Presentation code must read from here rather than switching on stage numbers
 * of its own, so that swapping procedural models for GLB files later changes
 * nothing about how state is decided.
 */

import type {
  CatState,
  CommunicationStyle,
  DogState,
  NagimalState,
  PlantState,
  Species,
  Stage,
} from '../models/types.ts';

export type LoopBehavior = 'once' | 'loop' | 'loop-limited';
export type MovementBehavior = 'still' | 'sway' | 'approach' | 'circle' | 'frantic';

export interface AnimationDescriptor {
  species: Species;
  stage: Stage;
  state: NagimalState;
  /** Key looked up in a GLB's animation clips, or in the procedural rig. */
  animation: string;
  soundKey: string | null;
  loop: LoopBehavior;
  movement: MovementBehavior;
  /** Used when no matching clip exists in a loaded model. */
  fallbackEffect: 'none' | 'pulse' | 'shake' | 'droop' | 'glow';
  /** Short caption shown to users who cannot hear the sound. */
  soundCaption: string | null;
}

const DOG_STATES: Record<Stage, DogState> = {
  0: 'resting',
  1: 'attentive',
  2: 'whining',
  3: 'nudging',
  4: 'barking',
};

const CAT_STATES: Record<Stage, CatState> = {
  0: 'lounging',
  1: 'slow_blink',
  2: 'staring',
  3: 'pawing',
  4: 'knocking_things_over',
};

const PLANT_STATES: Record<Stage, PlantState> = {
  0: 'healthy',
  1: 'dulling',
  2: 'drooping',
  3: 'wilted',
  4: 'severely_wilted',
};

export function stateForStage(species: Species, stage: Stage): NagimalState {
  switch (species) {
    case 'dog':
      return DOG_STATES[stage];
    case 'cat':
      return CAT_STATES[stage];
    case 'plant':
      return PLANT_STATES[stage];
  }
}

const ANIMATIONS: AnimationDescriptor[] = [
  // ---------------------------------------------------------------- dog ----
  { species: 'dog', stage: 0, state: 'resting', animation: 'dog_sleep', soundKey: null, loop: 'loop', movement: 'still', fallbackEffect: 'none', soundCaption: null },
  { species: 'dog', stage: 1, state: 'attentive', animation: 'dog_look_up', soundKey: null, loop: 'loop', movement: 'sway', fallbackEffect: 'pulse', soundCaption: null },
  { species: 'dog', stage: 2, state: 'whining', animation: 'dog_whine', soundKey: 'dog_whine', loop: 'loop-limited', movement: 'approach', fallbackEffect: 'pulse', soundCaption: 'A soft whine' },
  { species: 'dog', stage: 3, state: 'nudging', animation: 'dog_nudge', soundKey: 'dog_soft_bark', loop: 'loop-limited', movement: 'approach', fallbackEffect: 'shake', soundCaption: 'Restrained barks' },
  { species: 'dog', stage: 4, state: 'barking', animation: 'dog_bark', soundKey: 'dog_bark', loop: 'loop-limited', movement: 'frantic', fallbackEffect: 'shake', soundCaption: 'An urgent bark' },

  // ---------------------------------------------------------------- cat ----
  { species: 'cat', stage: 0, state: 'lounging', animation: 'cat_loaf', soundKey: null, loop: 'loop', movement: 'still', fallbackEffect: 'none', soundCaption: null },
  { species: 'cat', stage: 1, state: 'slow_blink', animation: 'cat_blink', soundKey: null, loop: 'loop', movement: 'still', fallbackEffect: 'none', soundCaption: null },
  { species: 'cat', stage: 2, state: 'staring', animation: 'cat_stare', soundKey: 'cat_meow', loop: 'loop', movement: 'sway', fallbackEffect: 'pulse', soundCaption: 'A repeated meow' },
  { species: 'cat', stage: 3, state: 'pawing', animation: 'cat_paw', soundKey: 'cat_meow_insistent', loop: 'loop', movement: 'circle', fallbackEffect: 'shake', soundCaption: 'Insistent meowing' },
  { species: 'cat', stage: 4, state: 'knocking_things_over', animation: 'cat_disturbance', soundKey: 'cat_knock_over', loop: 'loop-limited', movement: 'frantic', fallbackEffect: 'shake', soundCaption: 'Something is knocked off a shelf' },
  { species: 'cat', stage: 3, state: 'intervening_for_plant', animation: 'cat_paw_at_plant', soundKey: 'cat_meow_insistent', loop: 'loop', movement: 'circle', fallbackEffect: 'shake', soundCaption: 'Insistent meowing beside the fern' },
  { species: 'cat', stage: 2, state: 'intervening_for_dog', animation: 'cat_stare', soundKey: 'cat_meow', loop: 'loop', movement: 'sway', fallbackEffect: 'pulse', soundCaption: 'A pointed meow' },

  // -------------------------------------------------------------- plant ----
  { species: 'plant', stage: 0, state: 'healthy', animation: 'fern_healthy', soundKey: null, loop: 'loop', movement: 'sway', fallbackEffect: 'none', soundCaption: null },
  { species: 'plant', stage: 1, state: 'dulling', animation: 'fern_dulling', soundKey: null, loop: 'loop', movement: 'sway', fallbackEffect: 'none', soundCaption: null },
  { species: 'plant', stage: 2, state: 'drooping', animation: 'fern_drooping', soundKey: null, loop: 'loop', movement: 'still', fallbackEffect: 'droop', soundCaption: null },
  { species: 'plant', stage: 3, state: 'wilted', animation: 'fern_wilted', soundKey: null, loop: 'loop', movement: 'still', fallbackEffect: 'droop', soundCaption: null },
  { species: 'plant', stage: 4, state: 'severely_wilted', animation: 'fern_severely_wilted', soundKey: null, loop: 'loop', movement: 'still', fallbackEffect: 'droop', soundCaption: null },
];

const FALLBACK: AnimationDescriptor = {
  species: 'cat',
  stage: 0,
  state: 'lounging',
  animation: 'idle',
  soundKey: null,
  loop: 'loop',
  movement: 'still',
  fallbackEffect: 'none',
  soundCaption: null,
};

/**
 * Resolve the animation descriptor for a species/state pair. Never throws: an
 * unknown combination degrades to a calm idle rather than crashing the scene.
 */
export function describeAnimation(
  species: Species,
  state: NagimalState,
  stage: Stage,
): AnimationDescriptor {
  const exact = ANIMATIONS.find((a) => a.species === species && a.state === state);
  if (exact) return exact;
  const byStage = ANIMATIONS.find((a) => a.species === species && a.stage === stage);
  if (byStage) return byStage;
  const anyForSpecies = ANIMATIONS.find((a) => a.species === species);
  return anyForSpecies ?? FALLBACK;
}

export function allAnimationDescriptors(): readonly AnimationDescriptor[] {
  return ANIMATIONS;
}

/**
 * The line the household member says. Phrasing follows the user's chosen
 * communication preference; the underlying facts are identical in all three.
 */
export function messageFor(
  species: Species,
  stage: Stage,
  name: string,
  responsibilityTitle: string | null,
  style: CommunicationStyle,
  interveningForName: string | null = null,
): string {
  const subject = responsibilityTitle ?? 'nothing in particular';

  if (interveningForName) {
    switch (style) {
      case 'calm':
        return `${name} keeps glancing toward ${interveningForName}.`;
      case 'encouraging':
        return `${name} thinks ${interveningForName} could use a hand — you have got this.`;
      case 'direct':
        return `${name} is making a scene because ${interveningForName} has been neglected.`;
    }
  }

  if (species === 'plant') {
    const plantLines: Record<Stage, string> = {
      0: `${name} is upright and green. "${subject}" is on schedule.`,
      1: `${name} looks a little less vibrant. "${subject}" is just past due for a look.`,
      2: `${name} is drooping. "${subject}" has gone a while without attention.`,
      3: `${name} has dropped a few leaves over "${subject}".`,
      4: `${name} is badly wilted, though it can still recover. "${subject}" needs you.`,
    };
    return plantLines[stage];
  }

  if (species === 'dog') {
    const dogLines: Record<CommunicationStyle, Record<Stage, string>> = {
      calm: {
        0: `${name} is asleep. "${subject}" is comfortably ahead.`,
        1: `${name} has woken up and is watching you about "${subject}".`,
        2: `${name} has come over and is whining softly about "${subject}".`,
        3: `${name} will not settle. "${subject}" is close now.`,
        4: `${name} is barking. "${subject}" needs you right now.`,
      },
      encouraging: {
        0: `${name} is resting easy — "${subject}" is well in hand.`,
        1: `${name} perked up. A little progress on "${subject}" would feel good.`,
        2: `${name} is nudging you kindly toward "${subject}".`,
        3: `${name} is staying close. "${subject}" is nearly here, and you can still make it.`,
        4: `${name} is barking for you. "${subject}" is due — go finish it.`,
      },
      direct: {
        0: `${name} is off duty. "${subject}" is not due yet.`,
        1: `${name} is watching. "${subject}" is on the horizon.`,
        2: `${name} is whining. "${subject}" is inside a day.`,
        3: `${name} is at your feet. "${subject}" is hours away.`,
        4: `${name} is barking. "${subject}" is due or overdue.`,
      },
    };
    return dogLines[style][stage];
  }

  const catLines: Record<CommunicationStyle, Record<Stage, string>> = {
    calm: {
      0: `${name} is grooming and paying you no attention.`,
      1: `${name} gave you a slow blink about "${subject}".`,
      2: `${name} is staring at you about "${subject}".`,
      3: `${name} is pawing at "${subject}".`,
      4: `${name} has knocked something over about "${subject}".`,
    },
    encouraging: {
      0: `${name} is content. Nothing needs you.`,
      1: `${name} blinked at you — "${subject}" is drifting a little.`,
      2: `${name} would like a moment of your time for "${subject}".`,
      3: `${name} is pawing at "${subject}" and will not be talked out of it.`,
      4: `${name} has made a mess over "${subject}". Time to deal with it.`,
    },
    direct: {
      0: `${name} is ignoring you.`,
      1: `${name} noticed "${subject}" slipping.`,
      2: `${name} is staring. "${subject}" is overdue.`,
      3: `${name} is pawing at "${subject}".`,
      4: `${name} has knocked something off a shelf over "${subject}".`,
    },
  };
  return catLines[style][stage];
}
