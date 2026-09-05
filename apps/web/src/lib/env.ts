/**
 * Environment access. Validation is LAZY (per-getter) so the app builds and prerenders without
 * secrets present (handover: build must succeed with placeholders). A getter throws only when it is
 * actually invoked at runtime with a missing value.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const publicEnv = {
  // IMPORTANT: read NEXT_PUBLIC_* via LITERAL `process.env.NEXT_PUBLIC_X` access only. Next inlines
  // those into the browser bundle at build time; dynamic `process.env[name]` access is NOT inlined
  // and is `undefined` in the browser (this broke the browser Supabase client / Google OAuth).
  get supabaseUrl(): string {
    const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!value) throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL');
    return value;
  },
  get supabaseAnonKey(): string {
    // Support both the classic anon key and Supabase's newer publishable key name.
    const value =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!value) {
      throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
    return value;
  },
  get siteUrl(): string {
    // Defensive: strip any leading UTF-8 BOM (a real bug that broke v1's OAuth redirect).
    return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/^﻿/, '');
  },
  get googleAuthEnabled(): boolean {
    return process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true';
  },
};

/** Server-only secrets. Never import this into a Client Component. */
export const serverEnv = {
  get supabaseServiceRoleKey(): string {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
};
