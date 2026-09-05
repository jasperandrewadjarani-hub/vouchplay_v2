import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/**
 * Server Supabase client bound to the request's auth cookies (anon key, RLS-enforced). Use in
 * Server Components, Route Handlers, and Server Actions. In a plain Server Component, cookie writes
 * are no-ops (Next disallows them there) — that's fine; middleware refreshes the session.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render — safe to ignore; middleware handles refresh.
        }
      },
    },
  });
}
