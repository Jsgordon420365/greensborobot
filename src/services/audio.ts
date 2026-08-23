/**
 * Programmatic audio.
 *
 * Sounds are synthesised with the Web Audio API rather than shipped as files,
 * which keeps the bundle small and sidesteps asset licensing entirely. Every
 * sound has a visible caption elsewhere in the interface, so nothing is
 * conveyed by audio alone.
 *
 * Playback stays silent until a user gesture unlocks the audio context, and
 * respects a global mute. An urgent bark never loops indefinitely.
 */

import { logger } from '../lib/logger';

export type SoundKey =
  | 'dog_whine'
  | 'dog_soft_bark'
  | 'dog_bark'
  | 'cat_meow'
  | 'cat_meow_insistent'
  | 'cat_knock_over'
  | 'chime';

interface Voice {
  /** Base frequency in Hz. */
  frequency: number;
  /** Frequency at the end of the sweep. */
  endFrequency: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  /** How many times the sound repeats within one play call. Always finite. */
  repeats: number;
  gapMs: number;
}

const VOICES: Record<SoundKey, Voice> = {
  dog_whine:  { frequency: 420, endFrequency: 620, duration: 0.45, type: 'sine',     gain: 0.09, repeats: 2, gapMs: 260 },
  dog_soft_bark: { frequency: 240, endFrequency: 150, duration: 0.14, type: 'square', gain: 0.10, repeats: 2, gapMs: 220 },
  dog_bark:   { frequency: 300, endFrequency: 120, duration: 0.16, type: 'sawtooth', gain: 0.16, repeats: 3, gapMs: 190 },
  cat_meow:   { frequency: 700, endFrequency: 520, duration: 0.38, type: 'triangle', gain: 0.09, repeats: 1, gapMs: 0 },
  cat_meow_insistent: { frequency: 760, endFrequency: 480, duration: 0.34, type: 'triangle', gain: 0.12, repeats: 3, gapMs: 240 },
  cat_knock_over: { frequency: 180, endFrequency: 60, duration: 0.5, type: 'sawtooth', gain: 0.17, repeats: 1, gapMs: 0 },
  chime:      { frequency: 880, endFrequency: 1320, duration: 0.35, type: 'sine',    gain: 0.10, repeats: 1, gapMs: 0 },
};

let context: AudioContext | null = null;
let unlocked = false;
let muted = true;
const timers = new Set<ReturnType<typeof setTimeout>>();

/** Must be called from a user gesture. Browsers refuse audio before one. */
export async function unlockAudio(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return false;

  try {
    context ??= new Ctor();
    if (context.state === 'suspended') await context.resume();
    unlocked = context.state === 'running';
    logger.info('app.init', unlocked ? 'Audio unlocked by user gesture' : 'Audio still suspended', {
      state: context.state,
    });
    return unlocked;
  } catch {
    return false;
  }
}

export function setMuted(value: boolean): void {
  muted = value;
  if (value) stopAll();
}

export function isMuted(): boolean {
  return muted;
}

export function isUnlocked(): boolean {
  return unlocked;
}

export function stopAll(): void {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
}

function blip(voice: Voice, when: number): void {
  if (!context) return;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = voice.type;
  osc.frequency.setValueAtTime(voice.frequency, when);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, voice.endFrequency), when + voice.duration);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(voice.gain, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + voice.duration);
  osc.connect(gain).connect(context.destination);
  osc.start(when);
  osc.stop(when + voice.duration + 0.05);
}

/**
 * Play one sound. Returns false when it was suppressed, so callers can show
 * the visual equivalent instead of assuming the user heard anything.
 */
export function playSound(key: SoundKey | null, options: { quiet?: boolean } = {}): boolean {
  if (!key) return false;
  if (muted || options.quiet) return false;
  if (!unlocked || !context) return false;

  const voice = VOICES[key];
  if (!voice) return false;

  const start = context.currentTime;
  for (let i = 0; i < voice.repeats; i += 1) {
    blip(voice, start + (i * voice.gapMs) / 1000);
  }
  return true;
}

/** The caption shown to anyone who cannot hear the sound. */
export const SOUND_CAPTIONS: Record<SoundKey, string> = {
  dog_whine: 'A soft whine',
  dog_soft_bark: 'Restrained barks',
  dog_bark: 'An urgent bark',
  cat_meow: 'A quiet meow',
  cat_meow_insistent: 'Insistent meowing',
  cat_knock_over: 'Something knocked off a shelf',
  chime: 'A small chime',
};
