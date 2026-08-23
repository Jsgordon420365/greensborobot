/**
 * Environment detection and mode selection.
 *
 * Nagimals must never show a blank screen because a credential is missing. If
 * the Supabase variables are absent we fall back to Local Demonstration Mode
 * and say so plainly in the interface.
 */

import { logger } from './logger';

export type AppMode = 'connected' | 'local';

export interface EnvConfig {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  appUrl: string;
  vapidPublicKey: string | null;
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('your-') || trimmed === 'undefined') return null;
  return trimmed;
}

export function readEnv(): EnvConfig {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    supabaseUrl: clean(env.VITE_SUPABASE_URL),
    supabaseAnonKey: clean(env.VITE_SUPABASE_ANON_KEY),
    appUrl:
      clean(env.VITE_APP_URL) ??
      (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'),
    vapidPublicKey: clean(env.VITE_VAPID_PUBLIC_KEY),
  };
}

/**
 * Variables the operator still needs to supply before Connected Mode can run.
 * Surfaced verbatim in the UI so nobody has to read the source to find out.
 */
export function missingConnectedModeVars(config: EnvConfig = readEnv()): string[] {
  const missing: string[] = [];
  if (!config.supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!config.supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');
  return missing;
}

export function missingPushVars(config: EnvConfig = readEnv()): string[] {
  const missing = missingConnectedModeVars(config);
  if (!config.vapidPublicKey) missing.push('VITE_VAPID_PUBLIC_KEY');
  return missing;
}

let cachedMode: AppMode | null = null;

export function resolveMode(config: EnvConfig = readEnv()): AppMode {
  const mode: AppMode = missingConnectedModeVars(config).length === 0 ? 'connected' : 'local';
  if (cachedMode !== mode) {
    cachedMode = mode;
    logger.info('app.mode', `Running in ${mode === 'connected' ? 'Connected' : 'Local Demonstration'} Mode`, {
      mode,
      missing: missingConnectedModeVars(config),
    });
  }
  return mode;
}

/** Test seam: forget the memoized mode so a new env can be resolved. */
export function resetModeCache(): void {
  cachedMode = null;
}
