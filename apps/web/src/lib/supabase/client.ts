'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/**
 * Browser Supabase client (anon key). Subject to RLS. Use for client-side reads/session only -
 * privileged writes go through server actions / API routes (handover §35.4, §45).
 */
export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
