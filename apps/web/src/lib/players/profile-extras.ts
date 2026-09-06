import 'server-only';
import { skillByOrdinal } from '@vouchplay/config';
import { createServiceClient } from '@/lib/supabase/service';
import { divisionName } from '@/lib/tournaments/dto';

/**
 * Profile extras (handover §9.4 Achievements, §9.5 Skill Tags, §49 Tournament History). Public,
 * attributed community data (unlike the anonymous vouch aggregate). Read server-side with explicit
 * projections; per-viewer (voted/endorsed flags) so uncached.
 */

// ---------------------------------------------------------------------------
// Skill tags (§9.5)
// ---------------------------------------------------------------------------
export interface SkillTagView {
  id: string;
  name: string;
  slug: string;
  count: number;
  votedByViewer: boolean;
}

export async function getPlayerSkillTags(
  playerId: string,
  viewerId: string | null,
): Promise<SkillTagView[]> {
  try {
    const svc = createServiceClient();
    const [{ data: tags }, { data: votes }] = await Promise.all([
      svc.from('skill_tags').select('id, name, slug').eq('active', true),
      svc.from('player_skill_tag_votes').select('tag_id, voter_id').eq('player_id', playerId),
    ]);
    const voteRows = (votes ?? []) as { tag_id: string; voter_id: string }[];
    const countByTag = new Map<string, number>();
    const viewerVoted = new Set<string>();
    for (const v of voteRows) {
      countByTag.set(v.tag_id, (countByTag.get(v.tag_id) ?? 0) + 1);
      if (viewerId && v.voter_id === viewerId) viewerVoted.add(v.tag_id);
    }
    return ((tags ?? []) as { id: string; name: string; slug: string }[])
      .map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        count: countByTag.get(t.id) ?? 0,
        votedByViewer: viewerVoted.has(t.id),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Achievements (§9.4)
// ---------------------------------------------------------------------------
export interface AchievementView {
  id: string;
  type: 'official' | 'community_claim';
  title: string;
  description: string | null;
  placement: string | null;
  issuerType: string;
  verificationStatus: string;
  tournamentName: string | null;
  tournamentSlug: string | null;
  divisionName: string | null;
  issuedAt: string;
  endorsements: number;
  endorsedByViewer: boolean;
}

export async function getPlayerAchievements(
  playerId: string,
  viewerId: string | null,
): Promise<{ official: AchievementView[]; community: AchievementView[] }> {
  try {
    const svc = createServiceClient();
    const { data: links } = await svc
      .from('player_achievements')
      .select('achievement_id, placement')
      .eq('player_id', playerId);
    const linkRows = (links ?? []) as { achievement_id: string; placement: string | null }[];
    if (linkRows.length === 0) return { official: [], community: [] };
    const achievementIds = linkRows.map((l) => l.achievement_id);
    const placementById = new Map(linkRows.map((l) => [l.achievement_id, l.placement]));

    const [{ data: achs }, { data: endorsements }] = await Promise.all([
      svc
        .from('achievements')
        .select(
          'id, type, title, description, issuer_type, verification_status, tournament_id, division_id, issued_at',
        )
        .in('id', achievementIds),
      svc
        .from('achievement_endorsements')
        .select('achievement_id, user_id')
        .in('achievement_id', achievementIds),
    ]);
    const endorseRows = (endorsements ?? []) as { achievement_id: string; user_id: string }[];
    const endorseCount = new Map<string, number>();
    const viewerEndorsed = new Set<string>();
    for (const e of endorseRows) {
      endorseCount.set(e.achievement_id, (endorseCount.get(e.achievement_id) ?? 0) + 1);
      if (viewerId && e.user_id === viewerId) viewerEndorsed.add(e.achievement_id);
    }

    const achRows = (achs ?? []) as {
      id: string;
      type: 'official' | 'community_claim';
      title: string;
      description: string | null;
      issuer_type: string;
      verification_status: string;
      tournament_id: string | null;
      division_id: string | null;
      issued_at: string;
    }[];

    // Resolve tournament + division names for official achievements.
    const tournamentIds = Array.from(
      new Set(achRows.map((a) => a.tournament_id).filter((x): x is string => !!x)),
    );
    const divisionIds = Array.from(
      new Set(achRows.map((a) => a.division_id).filter((x): x is string => !!x)),
    );
    const [{ data: tRows }, { data: dRows }] = await Promise.all([
      tournamentIds.length
        ? svc.from('tournaments').select('id, name, slug').in('id', tournamentIds)
        : Promise.resolve({ data: [] }),
      divisionIds.length
        ? svc
            .from('divisions')
            .select(
              'id, name_override, skill_policy, minimum_skill, maximum_skill, format, sex_classification, minimum_age, maximum_age',
            )
            .in('id', divisionIds)
        : Promise.resolve({ data: [] }),
    ]);
    const tById = new Map(
      ((tRows ?? []) as { id: string; name: string; slug: string }[]).map((t) => [t.id, t]),
    );
    type DivRow = { id: string } & Parameters<typeof divisionName>[0];
    const dNameById = new Map(((dRows ?? []) as DivRow[]).map((d) => [d.id, divisionName(d)]));

    const views: AchievementView[] = achRows.map((a) => {
      const t = a.tournament_id ? tById.get(a.tournament_id) : null;
      return {
        id: a.id,
        type: a.type,
        title: a.title,
        description: a.description,
        placement: placementById.get(a.id) ?? null,
        issuerType: a.issuer_type,
        verificationStatus: a.verification_status,
        tournamentName: t?.name ?? null,
        tournamentSlug: t?.slug ?? null,
        divisionName: a.division_id ? (dNameById.get(a.division_id) ?? null) : null,
        issuedAt: a.issued_at,
        endorsements: endorseCount.get(a.id) ?? 0,
        endorsedByViewer: viewerEndorsed.has(a.id),
      };
    });
    views.sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
    return {
      official: views.filter((v) => v.type === 'official'),
      community: views.filter((v) => v.type === 'community_claim'),
    };
  } catch {
    return { official: [], community: [] };
  }
}

// ---------------------------------------------------------------------------
// Tournament history (§49) - derived from the player's registrations.
// ---------------------------------------------------------------------------
export interface HistoryEntry {
  tournamentName: string;
  tournamentSlug: string | null;
  divisionName: string;
  status: string;
  date: string | null;
}

const HISTORY_STATUSES = ['confirmed', 'waitlisted', 'payment_submitted', 'under_review'];

export async function getPlayerHistory(playerId: string): Promise<HistoryEntry[]> {
  try {
    const svc = createServiceClient();
    const { data: memberRows } = await svc
      .from('team_members')
      .select('team_id')
      .eq('player_id', playerId);
    const teamIds = ((memberRows ?? []) as { team_id: string }[]).map((r) => r.team_id);
    if (teamIds.length === 0) return [];

    const { data: regs } = await svc
      .from('registrations')
      .select('tournament_id, division_id, status, created_at')
      .in('team_id', teamIds)
      .in('status', HISTORY_STATUSES);
    const regRows = (regs ?? []) as {
      tournament_id: string;
      division_id: string;
      status: string;
      created_at: string;
    }[];
    if (regRows.length === 0) return [];

    const tournamentIds = Array.from(new Set(regRows.map((r) => r.tournament_id)));
    const divisionIds = Array.from(new Set(regRows.map((r) => r.division_id)));
    const [{ data: tRows }, { data: dRows }] = await Promise.all([
      svc.from('tournaments').select('id, name, slug, status, start_at').in('id', tournamentIds),
      svc
        .from('divisions')
        .select(
          'id, name_override, skill_policy, minimum_skill, maximum_skill, format, sex_classification, minimum_age, maximum_age',
        )
        .in('id', divisionIds),
    ]);
    const tById = new Map(
      (
        (tRows ?? []) as {
          id: string;
          name: string;
          slug: string;
          status: string;
          start_at: string | null;
        }[]
      ).map((t) => [t.id, t]),
    );
    type DivRow = { id: string } & Parameters<typeof divisionName>[0];
    const dNameById = new Map(((dRows ?? []) as DivRow[]).map((d) => [d.id, divisionName(d)]));

    const entries: HistoryEntry[] = [];
    for (const r of regRows) {
      const t = tById.get(r.tournament_id);
      // Only public (non-draft) tournaments appear in public history.
      if (!t || t.status === 'draft') continue;
      entries.push({
        tournamentName: t.name,
        tournamentSlug: t.slug,
        divisionName: dNameById.get(r.division_id) ?? 'Division',
        status: r.status,
        date: t.start_at ?? r.created_at,
      });
    }
    entries.sort((a, b) => (a.date && b.date ? (a.date < b.date ? 1 : -1) : 0));
    return entries;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// §50 Historical Skill Mismatch - evidence for the eligibility engine.
// ---------------------------------------------------------------------------
/**
 * True when the player holds an OFFICIAL achievement tied to a division whose skill band sits clearly
 * ABOVE `enteredMaxSkill` (organizer-confirmed higher-division play, §50). Evidence-only - no invented
 * score equivalencies. Returns false when there is no trustworthy data or no ceiling to compare to.
 */
export async function hasHistoricalSkillMismatch(
  playerId: string,
  enteredMaxSkill: number | null,
): Promise<boolean> {
  if (enteredMaxSkill == null) return false;
  try {
    const svc = createServiceClient();
    const { data: links } = await svc
      .from('player_achievements')
      .select('achievement_id')
      .eq('player_id', playerId);
    const ids = ((links ?? []) as { achievement_id: string }[]).map((l) => l.achievement_id);
    if (ids.length === 0) return false;
    const { data: achs } = await svc
      .from('achievements')
      .select('division_id, type')
      .in('id', ids)
      .eq('type', 'official');
    const divisionIds = Array.from(
      new Set(
        ((achs ?? []) as { division_id: string | null }[])
          .map((a) => a.division_id)
          .filter((x): x is string => !!x),
      ),
    );
    if (divisionIds.length === 0) return false;
    const { data: divs } = await svc
      .from('divisions')
      .select('minimum_skill, maximum_skill, skill_policy')
      .in('id', divisionIds);
    for (const d of (divs ?? []) as {
      minimum_skill: number | null;
      maximum_skill: number | null;
      skill_policy: string;
    }[]) {
      // A historical division whose FLOOR is above the entered division's CEILING = clearly higher.
      const floor = d.minimum_skill;
      if (d.skill_policy !== 'open' && floor != null && floor > enteredMaxSkill) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Convenience: a short skill-band label for a tag/achievement chip (unused ordinals -> ''). */
export function skillLabel(ordinal: number | null): string {
  return ordinal != null ? (skillByOrdinal(ordinal)?.label ?? '') : '';
}
