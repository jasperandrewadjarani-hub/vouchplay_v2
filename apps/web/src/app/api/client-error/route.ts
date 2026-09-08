import { NextResponse } from 'next/server';

/**
 * Privacy-safe client error telemetry (Phase 13.5 long-idle recovery). The App Router error
 * boundaries POST a small allowlisted payload here so a stale-tab crash is observable in server
 * logs. We deliberately accept only non-identifying fields: never form values, tokens, payment
 * evidence, or profile details. Unknown/oversized fields are dropped, not stored.
 */
export const runtime = 'nodejs';

const MAX_STR = 200;
const clip = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, MAX_STR) : null;

const VISIBILITY = new Set(['visible', 'hidden', 'prerender', 'unknown']);

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const safe = {
    route: clip(body.route),
    digest: clip(body.digest),
    // Error name/kind only, never the message (messages can carry interpolated user input).
    name: clip(body.name),
    visibility: VISIBILITY.has(String(body.visibility)) ? String(body.visibility) : 'unknown',
    persistedRestore: body.persistedRestore === true,
    authStale: body.authStale === true,
    deployVersion: clip(body.deployVersion),
    scope: body.scope === 'global' ? 'global' : 'app',
  };

  // Server-log sink is sufficient and privacy-safe on Vercel; no DB write, no PII.
  console.warn('[client-error]', JSON.stringify(safe));
  return NextResponse.json({ ok: true });
}
