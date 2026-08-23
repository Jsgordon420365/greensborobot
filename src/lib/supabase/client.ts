/**
 * Supabase client construction.
 *
 * Only the public anon key ever reaches this file. The service-role key is a
 * Function secret and must never be bundled into the browser.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readEnv } from '../env';
import { logger } from '../logger';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  const { supabaseUrl, supabaseAnonKey } = readEnv();
  if (!supabaseUrl || !supabaseAnonKey) return null;

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  logger.info('app.init', 'Created the Supabase client', { url: supabaseUrl });
  return client;
}

/** Test seam. */
export function resetSupabaseClient(): void {
  client = null;
}
