import 'server-only';
import { unstable_cache } from 'next/cache';
import type { ClubOfferRow, ClubOfferResponseRow } from '@vouchplay/db';
import { isOfferPubliclyVisible } from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import { avatarUrl, clubLogoUrl } from '@/lib/storage';

/**
 * Reads for club offers (Phase 14A). Player browse shows only open, non-expired offers from verified,
 * active clubs. Manager reads are viewer-scoped by the caller (authorized in the page/action). Offers
 * never touch scoring/eligibility - these are plain projections.
 */

export const OFFERS_LIST_TAG = 'offers:list';
export const clubOffersTag = (clubId: string) => `club-offers:${clubId}`;

export interface OfferDTO {
  id: string;
  clubId: string;
  clubName: string;
  clubSlug: string | null;
  clubLogoUrl: string | null;
  type: 'recruitment' | 'sponsorship';
  title: string;
  description: string | null;
  city: string | null;
  minSkill: number | null;
  maxSkill: number | null;
  status: string;
  publishedAt: string | null;
  expiresAt: string | null;
}

export interface OfferResponseDTO {
  id: string;
  offerId: string;
  playerId: string;
  playerName: string;
  playerSlug: string | null;
  playerAvatarUrl: string | null;
  status: string;
  message: string | null;
  createdAt: string;
}

interface ClubMini {
  name: string;
  slug: string | null;
  logoUrl: string | null;
}

async function resolveClubs(clubIds: string[]): Promise<Map<string, ClubMini>> {
  const map = new Map<string, ClubMini>();
  const ids = Array.from(new Set(clubIds));
  if (ids.length === 0) return map;
  const { data } = await createServiceClient()
    .from('clubs')
    .select('id, name, slug, logo_path')
    .in('id', ids);
  for (const c of (data ?? []) as {
    id: string;
    name: string;
    slug: string | null;
    logo_path: string | null;
  }[]) {
    map.set(c.id, { name: c.name, slug: c.slug, logoUrl: clubLogoUrl(c.logo_path) });
  }
  return map;
}

function toOfferDTO(row: ClubOfferRow, club: ClubMini | undefined): OfferDTO {
  return {
    id: row.id,
    clubId: row.club_id,
    clubName: club?.name ?? 'Club',
    clubSlug: club?.slug ?? null,
    clubLogoUrl: club?.logoUrl ?? null,
    type: row.type,
    title: row.title,
    description: row.description,
    city: row.city,
    minSkill: row.min_skill,
    maxSkill: row.max_skill,
    status: row.status,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Open, non-expired offers from verified, active clubs - the public player browse. Cache-first
 * (master_plan §2AC): pure public data (service client, no viewer fields), 60s TTL, tagged
 * OFFERS_LIST_TAG which the offer write actions already revalidate, so a new/withdrawn offer shows
 * immediately and the TTL is only a backstop.
 */
export async function listOpenOffers(limit = 60): Promise<OfferDTO[]> {
  return unstable_cache(() => fetchOpenOffers(limit), ['open-offers', String(limit)], {
    revalidate: 60,
    tags: [OFFERS_LIST_TAG],
  })();
}

async function fetchOpenOffers(limit: number): Promise<OfferDTO[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('club_offers')
    .select(
      'id, club_id, type, title, description, city, min_skill, max_skill, status, published_at, expires_at, created_by, created_at, updated_at',
    )
    .eq('status', 'open')
    .order('published_at', { ascending: false })
    .limit(limit);
  const rows = ((data ?? []) as ClubOfferRow[]).filter((r) =>
    isOfferPubliclyVisible(r.status, r.expires_at),
  );
  if (rows.length === 0) return [];
  // Only surface offers from verified, active, non-deleted clubs.
  const { data: clubRows } = await svc
    .from('clubs')
    .select('id')
    .in('id', Array.from(new Set(rows.map((r) => r.club_id))))
    .eq('verification_status', 'verified')
    .eq('activity_status', 'active')
    .is('deleted_at', null);
  const visibleClubIds = new Set(((clubRows ?? []) as { id: string }[]).map((c) => c.id));
  const kept = rows.filter((r) => visibleClubIds.has(r.club_id));
  const clubs = await resolveClubs(kept.map((r) => r.club_id));
  return kept.map((r) => toOfferDTO(r, clubs.get(r.club_id)));
}

/** All offers for one club (manager view). Authorize the caller before calling. */
export async function getClubOffers(clubId: string): Promise<OfferDTO[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('club_offers')
    .select(
      'id, club_id, type, title, description, city, min_skill, max_skill, status, published_at, expires_at, created_by, created_at, updated_at',
    )
    .eq('club_id', clubId)
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as ClubOfferRow[];
  const clubs = await resolveClubs([clubId]);
  return rows.map((r) => toOfferDTO(r, clubs.get(clubId)));
}

/** Active (non-withdrawn) responses to a club's offers, keyed by offer id. Manager view. */
export async function getResponsesForClub(
  clubId: string,
): Promise<Map<string, OfferResponseDTO[]>> {
  const svc = createServiceClient();
  const { data: offerRows } = await svc.from('club_offers').select('id').eq('club_id', clubId);
  const offerIds = ((offerRows ?? []) as { id: string }[]).map((o) => o.id);
  const byOffer = new Map<string, OfferResponseDTO[]>();
  if (offerIds.length === 0) return byOffer;
  const { data } = await svc
    .from('club_offer_responses')
    .select('id, offer_id, player_id, status, message, created_at')
    .in('offer_id', offerIds)
    .neq('status', 'withdrawn')
    .order('created_at', { ascending: false });
  const responses = (data ?? []) as Pick<
    ClubOfferResponseRow,
    'id' | 'offer_id' | 'player_id' | 'status' | 'message' | 'created_at'
  >[];
  const playerIds = Array.from(new Set(responses.map((r) => r.player_id)));
  const players = await resolvePlayers(playerIds);
  for (const r of responses) {
    const p = players.get(r.player_id);
    const dto: OfferResponseDTO = {
      id: r.id,
      offerId: r.offer_id,
      playerId: r.player_id,
      playerName: p?.name ?? 'VouchPlay player',
      playerSlug: p?.slug ?? null,
      playerAvatarUrl: p?.avatarUrl ?? null,
      status: r.status,
      message: r.message,
      createdAt: r.created_at,
    };
    const list = byOffer.get(r.offer_id) ?? [];
    list.push(dto);
    byOffer.set(r.offer_id, list);
  }
  return byOffer;
}

/** A player's own live responses, keyed by offer id (for the browse "already responded" state). */
export async function getMyResponseOfferIds(playerId: string): Promise<Set<string>> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('club_offer_responses')
    .select('offer_id')
    .eq('player_id', playerId)
    .in('status', ['submitted', 'accepted']);
  return new Set(((data ?? []) as { offer_id: string }[]).map((r) => r.offer_id));
}

interface PlayerMini {
  name: string;
  slug: string | null;
  avatarUrl: string | null;
}

async function resolvePlayers(ids: string[]): Promise<Map<string, PlayerMini>> {
  const map = new Map<string, PlayerMini>();
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return map;
  const { data } = await createServiceClient()
    .from('profiles')
    .select('id, first_name, last_name, nickname, slug, avatar_path')
    .in('id', unique);
  for (const r of (data ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
    slug: string | null;
    avatar_path: string | null;
  }[]) {
    map.set(r.id, {
      name:
        [r.first_name, r.last_name].filter(Boolean).join(' ').trim() ||
        r.nickname ||
        'VouchPlay player',
      slug: r.slug,
      avatarUrl: avatarUrl(r.avatar_path),
    });
  }
  return map;
}
