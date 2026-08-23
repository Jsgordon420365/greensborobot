import { resolveMode } from '../lib/env';
import { LocalRepository } from './localRepository';
import { SupabaseRepository } from './supabaseRepository';
import type { NagimalsRepository } from './repository';

let instance: NagimalsRepository | null = null;

/**
 * The repository for the current mode. Local Demonstration Mode is chosen
 * automatically when Supabase credentials are absent, so the app never breaks
 * because a secret is missing.
 */
export function getRepository(): NagimalsRepository {
  if (instance) return instance;
  instance = resolveMode() === 'connected' ? new SupabaseRepository() : new LocalRepository();
  return instance;
}

/** Test seam. */
export function setRepository(repository: NagimalsRepository | null): void {
  instance = repository;
}

export * from './repository';
export { LocalRepository } from './localRepository';
export { SupabaseRepository } from './supabaseRepository';
