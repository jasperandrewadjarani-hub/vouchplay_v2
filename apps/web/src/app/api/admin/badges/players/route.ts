import { NextResponse } from 'next/server';
import { SKILL_BANDS } from '@vouchplay/config';
import { getViewerContext } from '@/lib/auth';
import { assertAdminActor } from '@/lib/moderation/staff';
import { listPlayersForBadgeTagging } from '@/lib/admin/user-queries';

/**
 * GET /api/admin/badges/players (master_plan §2BM Decision C): the Tag screen's search/filter/page
 * data source. Same admin + MFA guard as the badge admin server actions (`assertAdminActor`), but a
 * plain GET so the client can `fetch` it with an `AbortController` - a search keystroke or filter tap
 * can now be cancelled and re-issued without ever queuing behind a Next.js navigation or another
 * pending server action (the "bottom nav stops responding" bug).
 *
 * `Cache-Control: no-store` + `dynamic = 'force-dynamic'`: admin data, never cached, never statically
 * evaluated at build.
 */
export const dynamic = 'force-dynamic';

const PAGE_SIZE_DEFAULT = 30;
const PAGE_SIZE_MAX = 100;

function noStoreJson(body: unknown, status = 200): Response {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function parseIntParam(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw != null ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export async function GET(req: Request): Promise<Response> {
  // Two-step guard so the response can distinguish "sign in" (401) from "not authorized" (403), the
  // same split the tournament export route uses.
  const { viewerId } = await getViewerContext();
  if (!viewerId) return noStoreJson({ error: 'Sign in required.' }, 401);

  const actor = await assertAdminActor();
  if (!actor) {
    return noStoreJson(
      { error: 'Admin access with a stepped-up (two-factor) session is required.' },
      403,
    );
  }

  const sp = new URL(req.url).searchParams;
  const q = sp.get('q')?.trim() || undefined;
  const city = sp.get('city')?.trim() || undefined;
  const noBadges = sp.get('noBadges') === '1';

  let tier: number | undefined;
  const tierRaw = sp.get('tier');
  if (tierRaw != null && tierRaw !== '') {
    const n = Number(tierRaw);
    if (Number.isInteger(n) && SKILL_BANDS.some((b) => b.ordinal === n)) tier = n;
  }

  const page = parseIntParam(sp.get('page'), 1, 1, 100000);
  const pageSize = parseIntParam(sp.get('pageSize'), PAGE_SIZE_DEFAULT, 1, PAGE_SIZE_MAX);

  const result = await listPlayersForBadgeTagging({ q, tier, city, noBadges, page, pageSize });
  return noStoreJson(result);
}
