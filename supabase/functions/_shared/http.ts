/**
 * Shared HTTP helpers for the Nagimals Edge Functions.
 *
 * Every function authenticates the caller with their own JWT and then queries
 * through a client carrying that JWT, so Row Level Security remains the last
 * line of defence even if a handler forgets an ownership check.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function preflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  return null;
}

export interface Caller {
  userId: string;
  /** Client bound to the caller's JWT. RLS applies to everything it does. */
  client: SupabaseClient;
}

/** Resolve the caller, or return null when the request is not authenticated. */
export async function authenticate(request: Request): Promise<Caller | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set.');

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { userId: data.user.id, client };
}

/**
 * A service-role client. Only for the notification sweep, which legitimately
 * reads across users. Never returned to, or reachable from, the browser.
 */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Structured log line, matching the browser logger's shape. */
export function log(
  severity: 'info' | 'warn' | 'error',
  operation: string,
  message: string,
  context: Record<string, unknown> = {},
): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      severity,
      operation,
      message,
      context,
    }),
  );
}
