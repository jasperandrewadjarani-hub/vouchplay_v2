import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';

/**
 * Anonymous, cookie-less Supabase client for CACHE-FIRST PUBLIC READS (handover §34A.5
 * PUBLIC_REVALIDATED). RLS still applies as the `anon` role - it can only see rows the public read
 * policies allow - so this is safe to call inside `unstable_cache` (where request cookies/headers are
 * unavailable, unlike the cookie-bound server client). Never use for writes or authenticated reads.
 */
export function createPublicClient() {
  return createSupabaseClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
