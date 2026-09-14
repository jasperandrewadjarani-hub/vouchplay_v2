/**
 * The public VAPID key (master_plan §2AY decision D), read from a `NEXT_PUBLIC_*` env var so it is
 * inlined at build time into the client bundle. Deliberately a plain module (no `'use server'` /
 * `'use client'` directive) so both server and client code can import the same constant. Empty in dev
 * until the two VAPID env vars are set - every push-consuming component must work with `''`.
 */
export const VAPID_PUBLIC_KEY: string = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
