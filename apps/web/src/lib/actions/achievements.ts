'use server';

import { revalidatePath } from 'next/cache';
import { officialAchievement } from '@vouchplay/config';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { isBlockedBetween, checkActorCanInteract } from '@/lib/moderation/enforcement';
import { authorizeOrganizer } from '@/lib/tournaments/authz';
import { writeAudit } from '@/lib/moderation/audit';
import { notify } from '@/lib/notifications/create';
import { getActorMini, getTeamMemberIds, getTournamentMini } from '@/lib/notifications/recipients';

export interface AchievementActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

async function revalPlayer(svc: ReturnType<typeof createServiceClient>, playerId: string) {
  const { data } = await svc.from('profiles').select('slug').eq('id', playerId).maybeSingle();
  const slug = (data as { slug: string | null } | null)?.slug;
  if (slug) revalidatePath(`/players/${slug}`);
}

// ---------------------------------------------------------------------------
// Skill tags (§9.5) - endorse a trait on ANOTHER player's profile.
// ---------------------------------------------------------------------------
export async function toggleSkillTag(
  playerId: string,
  tagId: string,
): Promise<AchievementActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (playerId === user.id) return { error: 'You cannot tag your own profile.' };
  const statusErr = await checkActorCanInteract(user.id);
  if (statusErr) return { error: statusErr };
  const svc = createServiceClient();
  try {
    if (await isBlockedBetween(user.id, playerId)) return { error: 'That action is unavailable.' };
    const { data: existing } = await svc
      .from('player_skill_tag_votes')
      .select('id')
      .eq('player_id', playerId)
      .eq('tag_id', tagId)
      .eq('voter_id', user.id)
      .maybeSingle();
    if (existing) {
      await svc
        .from('player_skill_tag_votes')
        .delete()
        .eq('id', (existing as { id: string }).id);
    } else {
      const { error } = await svc
        .from('player_skill_tag_votes')
        .insert({ player_id: playerId, tag_id: tagId, voter_id: user.id });
      if (error) return { error: 'Could not save your endorsement.' };
    }
    await revalPlayer(svc, playerId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Community achievement claims (§9.4) - a player adds their own claim.
// ---------------------------------------------------------------------------
export async function addCommunityAchievement(
  title: string,
  description: string,
): Promise<AchievementActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const t = title.trim();
  if (t.length < 2 || t.length > 80)
    return { error: 'Give your claim a short title (2-80 chars).' };
  const statusErr = await checkActorCanInteract(user.id);
  if (statusErr) return { error: statusErr };
  const svc = createServiceClient();
  try {
    const { count } = await svc
      .from('player_achievements')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', user.id);
    if ((count ?? 0) >= 50) return { error: 'You have reached the maximum number of claims.' };

    const { data: ach, error } = await svc
      .from('achievements')
      .insert({
        type: 'community_claim',
        title: t,
        description: description.trim() || null,
        issuer_type: 'self',
        issuer_id: user.id,
        verification_status: 'community',
      })
      .select('id')
      .single();
    if (error || !ach) return { error: 'Could not add your claim.' };
    await svc
      .from('player_achievements')
      .insert({ player_id: user.id, achievement_id: (ach as { id: string }).id });
    await revalPlayer(svc, user.id);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Claim added.' };
}

// ---------------------------------------------------------------------------
// Peer-nominated achievements (§9.4) - someone adds a claim FOR you, you confirm it.
//
// A nomination is invisible to everyone except the subject until they confirm it, so no one can put
// words on another player's profile. State lives in achievements.verification_status:
//   'pending_subject' -> awaiting the subject's decision (private to them)
//   'community'       -> confirmed by the subject, now public and endorsable
// Declining deletes the row outright, and the nominator is not told, so a decline can never become
// a source of friction between two players.
// ---------------------------------------------------------------------------
const PENDING = 'pending_subject';
/** A player can hold this many undecided nominations before new ones are refused (anti-spam). */
const MAX_PENDING_PER_PLAYER = 20;

export async function nominateAchievement(
  playerId: string,
  title: string,
  description: string,
): Promise<AchievementActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (playerId === user.id) {
    return { error: 'This is your own profile - use "Add a claim" instead.' };
  }
  const t = title.trim();
  if (t.length < 2 || t.length > 80) return { error: 'Give the claim a short title (2-80 chars).' };
  const statusErr = await checkActorCanInteract(user.id);
  if (statusErr) return { error: statusErr };

  const svc = createServiceClient();
  try {
    if (await isBlockedBetween(user.id, playerId)) return { error: 'That action is unavailable.' };

    const { data: target } = await svc
      .from('profiles')
      .select('id, account_status, onboarded_at')
      .eq('id', playerId)
      .maybeSingle();
    const tp = target as { account_status: string; onboarded_at: string | null } | null;
    if (!tp || tp.account_status !== 'active' || !tp.onboarded_at) {
      return { error: 'That player is not available right now.' };
    }

    // Existing links for this player, so we can cap pending nominations and stop one person
    // sending the same player a second nomination while the first is still undecided.
    const { data: links } = await svc
      .from('player_achievements')
      .select('achievement_id')
      .eq('player_id', playerId);
    const ids = ((links ?? []) as { achievement_id: string }[]).map((l) => l.achievement_id);
    if (ids.length > 0) {
      const { data: pendingRows } = await svc
        .from('achievements')
        .select('id, issuer_id')
        .in('id', ids)
        .eq('verification_status', PENDING);
      const pending = (pendingRows ?? []) as { issuer_id: string | null }[];
      if (pending.length >= MAX_PENDING_PER_PLAYER) {
        return { error: 'This player has too many claims waiting. Try again once they catch up.' };
      }
      if (pending.some((p) => p.issuer_id === user.id)) {
        return { error: 'You already added a claim for this player. Wait for them to confirm it.' };
      }
    }

    const { data: ach, error } = await svc
      .from('achievements')
      .insert({
        type: 'community_claim',
        title: t,
        description: description.trim() || null,
        issuer_type: 'peer',
        issuer_id: user.id,
        verification_status: PENDING,
      })
      .select('id')
      .single();
    if (error || !ach) return { error: 'Could not add the claim. Please try again.' };
    const achievementId = (ach as { id: string }).id;

    const { error: linkErr } = await svc
      .from('player_achievements')
      .insert({ player_id: playerId, achievement_id: achievementId });
    if (linkErr) {
      // Never leave an orphan achievement row behind.
      await svc.from('achievements').delete().eq('id', achievementId);
      return { error: 'Could not add the claim. Please try again.' };
    }

    const me = await getActorMini(user.id);
    await notify({
      recipientId: playerId,
      type: 'achievement_nominated',
      actorId: user.id,
      params: { actorName: me.name, extra: t },
      link: '/me',
      entityType: 'achievement',
      entityId: achievementId,
    });
    await revalPlayer(svc, playerId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Sent. It shows on their profile once they confirm it.' };
}

/** The subject confirms or declines a claim someone else added for them (§9.4). */
export async function respondToAchievementNomination(
  achievementId: string,
  accept: boolean,
): Promise<AchievementActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const [{ data: ach }, { data: link }] = await Promise.all([
      svc
        .from('achievements')
        .select('id, type, issuer_id, verification_status')
        .eq('id', achievementId)
        .maybeSingle(),
      svc
        .from('player_achievements')
        .select('player_id')
        .eq('achievement_id', achievementId)
        .maybeSingle(),
    ]);
    const a = ach as { type: string; issuer_id: string | null; verification_status: string } | null;
    const subjectId = (link as { player_id: string } | null)?.player_id ?? null;
    if (!a || a.type !== 'community_claim' || a.verification_status !== PENDING) {
      return { error: 'That claim is no longer waiting for a decision.' };
    }
    // Only the player the claim is about may decide it.
    if (subjectId !== user.id) return { error: 'Only this player can confirm their own claims.' };

    if (accept) {
      const { error } = await svc
        .from('achievements')
        .update({ verification_status: 'community' })
        .eq('id', achievementId);
      if (error) return { error: 'Could not confirm the claim. Please try again.' };
      if (a.issuer_id) {
        const me = await getActorMini(user.id);
        await notify({
          recipientId: a.issuer_id,
          type: 'achievement_nomination_confirmed',
          actorId: user.id,
          params: { actorName: me.name },
          link: me.slug ? `/players/${me.slug}` : '/players',
          entityType: 'achievement',
          entityId: achievementId,
        });
      }
    } else {
      // Declining removes it entirely and the nominator is never notified.
      await svc.from('achievements').delete().eq('id', achievementId);
    }
    await revalPlayer(svc, user.id);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: accept ? 'Added to your profile.' : 'Declined.' };
}

export async function removeCommunityAchievement(
  achievementId: string,
): Promise<AchievementActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const [{ data: ach }, { data: link }] = await Promise.all([
      svc.from('achievements').select('id, type, issuer_id').eq('id', achievementId).maybeSingle(),
      svc
        .from('player_achievements')
        .select('player_id')
        .eq('achievement_id', achievementId)
        .maybeSingle(),
    ]);
    const a = ach as { type: string; issuer_id: string | null } | null;
    const subjectId = (link as { player_id: string } | null)?.player_id ?? null;
    // Whoever wrote the claim may take it back, and the player it is about may always remove it
    // from their own profile - including one a peer added and they later confirmed.
    const canRemove = a?.issuer_id === user.id || subjectId === user.id;
    if (!a || a.type !== 'community_claim' || !canRemove) {
      return { error: 'You can only remove your own community claims.' };
    }
    await svc.from('achievements').delete().eq('id', achievementId);
    await revalPlayer(svc, subjectId ?? user.id);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Claim removed.' };
}

/** Endorse (thumbs-up) another player's community claim (§9.4). Toggle. */
export async function toggleEndorsement(achievementId: string): Promise<AchievementActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const [{ data: ach }, { data: link }] = await Promise.all([
      svc
        .from('achievements')
        .select('type, issuer_id, verification_status')
        .eq('id', achievementId)
        .maybeSingle(),
      svc
        .from('player_achievements')
        .select('player_id')
        .eq('achievement_id', achievementId)
        .maybeSingle(),
    ]);
    const a = ach as { type: string; issuer_id: string | null; verification_status: string } | null;
    const subjectId = (link as { player_id: string } | null)?.player_id ?? null;
    if (!a || a.type !== 'community_claim')
      return { error: 'Only community claims can be endorsed.' };
    // A claim awaiting its subject's decision is private to them - nothing to endorse yet.
    if (a.verification_status === PENDING) return { error: 'That claim is not public yet.' };
    if (a.issuer_id === user.id) return { error: 'You cannot endorse your own claim.' };

    const { data: existing } = await svc
      .from('achievement_endorsements')
      .select('id')
      .eq('achievement_id', achievementId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing) {
      await svc
        .from('achievement_endorsements')
        .delete()
        .eq('id', (existing as { id: string }).id);
    } else {
      await svc
        .from('achievement_endorsements')
        .insert({ achievement_id: achievementId, user_id: user.id });
    }
    if (subjectId) await revalPlayer(svc, subjectId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Official achievements (§9.4) - a verified organizer issues to a confirmed team.
// ---------------------------------------------------------------------------
export async function issueOfficialAchievement(
  tournamentId: string,
  teamId: string,
  achievementKey: string,
): Promise<AchievementActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId))) {
    return { error: 'Only this tournament’s organizers can issue achievements.' };
  }
  const template = officialAchievement(achievementKey);
  if (!template) return { error: 'Unknown achievement.' };
  const svc = createServiceClient();
  try {
    const { data: team } = await svc
      .from('teams')
      .select('id, tournament_id, division_id')
      .eq('id', teamId)
      .maybeSingle();
    const teamRow = team as { tournament_id: string; division_id: string } | null;
    if (!teamRow || teamRow.tournament_id !== tournamentId) return { error: 'Team not found.' };
    const members = await getTeamMemberIds(teamId);
    if (members.length === 0) return { error: 'That team has no members.' };

    const { data: ach, error } = await svc
      .from('achievements')
      .insert({
        type: 'official',
        title: template.title,
        issuer_type: 'organizer',
        issuer_id: user.id,
        tournament_id: tournamentId,
        division_id: teamRow.division_id,
        verification_status: 'verified',
      })
      .select('id')
      .single();
    if (error || !ach) return { error: 'Could not issue the achievement.' };
    const achievementId = (ach as { id: string }).id;

    await svc.from('player_achievements').insert(
      members.map((playerId) => ({
        player_id: playerId,
        achievement_id: achievementId,
        placement: template.placement,
      })),
    );
    await writeAudit({
      actorId: user.id,
      action: 'achievement.issued',
      entityType: 'achievement',
      entityId: achievementId,
      after: { title: template.title, team_id: teamId, tournament_id: tournamentId },
    });

    const tm = await getTournamentMini(tournamentId);
    for (const playerId of members) {
      await notify({
        recipientId: playerId,
        type: 'achievement_awarded',
        params: { extra: template.title, tournamentName: tm.name },
        link: tm.slug ? `/tournaments/${tm.slug}` : '/tournaments',
        entityType: 'achievement',
        entityId: achievementId,
      });
      await revalPlayer(svc, playerId);
    }
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: `${template.title} issued.` };
}

export async function removeOfficialAchievement(
  achievementId: string,
  tournamentId: string,
): Promise<AchievementActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId))) {
    return { error: 'You do not have permission to remove this achievement.' };
  }
  const svc = createServiceClient();
  try {
    const { data: ach } = await svc
      .from('achievements')
      .select('id, type, tournament_id')
      .eq('id', achievementId)
      .maybeSingle();
    const a = ach as { type: string; tournament_id: string | null } | null;
    if (!a || a.type !== 'official' || a.tournament_id !== tournamentId) {
      return { error: 'Achievement not found for this tournament.' };
    }
    const { data: links } = await svc
      .from('player_achievements')
      .select('player_id')
      .eq('achievement_id', achievementId);
    const players = ((links ?? []) as { player_id: string }[]).map((l) => l.player_id);
    await svc.from('achievements').delete().eq('id', achievementId);
    await writeAudit({
      actorId: user.id,
      action: 'achievement.removed',
      entityType: 'achievement',
      entityId: achievementId,
    });
    for (const playerId of players) await revalPlayer(svc, playerId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Achievement removed.' };
}
