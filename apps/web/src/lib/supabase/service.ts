import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';

/**
 * Service-role Supabase client — BYPASSES RLS. Server-only, privileged. Use ONLY inside audited
 * admin/domain operations that have already performed their own authorization check (handover §37,
 * §35.4). Never expose the service-role key to the browser; `server-only` fails the build if this
 * module is ever imported into client code.
 */
export function createServiceClient() {
  return createSupabaseClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
