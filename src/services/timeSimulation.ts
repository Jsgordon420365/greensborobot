/**
 * Proof-of-concept time simulation.
 *
 * The system clock is never touched. An offset is stored separately from the
 * household and added to `Date.now()` to produce the *effective* time that the
 * rules engine is evaluated against, so the demonstration is reproducible and
 * reversible.
 */

import { DAY, HOUR, MINUTE } from '../domain';
import { logger } from '../lib/logger';

const STORAGE_KEY = 'nagimals.timeOffsetMs';

export interface TimePreset {
  id: string;
  label: string;
  /** Fixed offset from real now, in ms. Null means "relative to a deadline". */
  offsetMs: number | null;
  /** For deadline-relative presets: ms before the deadline to land on. */
  beforeDeadlineMs?: number;
  description: string;
}

export const TIME_PRESETS: readonly TimePreset[] = [
  { id: 'now', label: 'Now', offsetMs: 0, description: 'Real time. No simulation.' },
  { id: 'plus6h', label: 'Six hours later', offsetMs: 6 * HOUR, description: 'Six hours from now.' },
  { id: 'plus1d', label: 'One day later', offsetMs: DAY, description: 'One day from now.' },
  { id: 'plus3d', label: 'Three days later', offsetMs: 3 * DAY, description: 'Three days from now.' },
  {
    id: 'deadline-1h',
    label: 'One hour before deadline',
    offsetMs: null,
    beforeDeadlineMs: HOUR,
    description: 'Jumps to one hour before the soonest active deadline.',
  },
  {
    id: 'deadline-15m',
    label: 'Fifteen minutes before deadline',
    offsetMs: null,
    beforeDeadlineMs: 15 * MINUTE,
    description: 'Jumps to fifteen minutes before the soonest active deadline.',
  },
  {
    id: 'deadline-past',
    label: 'Past deadline',
    offsetMs: null,
    beforeDeadlineMs: -30 * MINUTE,
    description: 'Jumps to thirty minutes after the soonest active deadline.',
  },
] as const;

export function readOffset(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function writeOffset(offsetMs: number, reason: string): void {
  try {
    if (offsetMs === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(offsetMs));
  } catch {
    // A storage failure must not break the control; the offset just won't persist.
  }
  logger.info('time.simulate', reason, {
    offsetMs,
    offsetHours: Math.round((offsetMs / HOUR) * 100) / 100,
  });
}

/** The effective time the rules engine should be evaluated against. */
export function effectiveNow(offsetMs = readOffset()): number {
  return Date.now() + offsetMs;
}

/**
 * Resolve a preset into an offset. Deadline-relative presets need the soonest
 * upcoming deadline, which the caller supplies from the current household.
 */
export function offsetForPreset(
  preset: TimePreset,
  soonestDeadlineMs: number | null,
): number {
  if (preset.offsetMs !== null) return preset.offsetMs;
  if (soonestDeadlineMs === null) return 0;
  const target = soonestDeadlineMs - (preset.beforeDeadlineMs ?? 0);
  return target - Date.now();
}

export function describeOffset(offsetMs: number): string {
  if (offsetMs === 0) return 'Real time';
  const abs = Math.abs(offsetMs);
  const direction = offsetMs > 0 ? 'ahead' : 'behind';
  if (abs < HOUR) return `${Math.round(abs / MINUTE)} minutes ${direction}`;
  if (abs < 2 * DAY) return `${Math.round(abs / HOUR)} hours ${direction}`;
  return `${Math.round((abs / DAY) * 10) / 10} days ${direction}`;
}
