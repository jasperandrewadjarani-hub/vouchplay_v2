import {
  BadgeCheck,
  ShieldCheck,
  Handshake,
  UserSearch,
  GraduationCap,
  Trophy,
  Clock,
  Medal,
} from 'lucide-react';
import type { SkillBand } from '@vouchplay/config';

/**
 * Skill pill: named, color-coded skill band with a source label. Community Skill and Self-Rated are
 * DISTINCT concepts (§3.3) - the label makes clear which one is shown. Never derived from STS.
 */
export function SkillPill({
  band,
  source,
  size = 'md',
}: {
  band: SkillBand;
  source: 'community' | 'self';
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  const dot = size === 'sm' ? 6 : 7;
  return (
    <span
      // whitespace-nowrap + shrink-0: the pill keeps its natural width instead of being squeezed
      // until its own text wraps, which is what leaves a compact list ragged (§1H, §1T, §1W).
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ${pad}`}
      style={{ backgroundColor: `${band.color}22`, color: band.color }}
      title={`${source === 'community' ? 'Community skill' : 'Self-rated'}: ${band.label}`}
    >
      <span
        className="rounded-full"
        style={{ width: dot, height: dot, backgroundColor: band.color }}
      />
      {band.label}
      <span className="opacity-70">· {source === 'community' ? 'Community' : 'Self-rated'}</span>
    </span>
  );
}

/**
 * STS chip (Skill-Trust Score, 0–5 confidence). Shown only when computed. Purely informational -
 * VouchPlay never ranks players by STS (§6, §8.4). Lives in its own client component because it
 * opens a tap-to-explain dialog; re-exported here so existing import sites are unchanged.
 */
export { StsChip } from './sts-chip';

const chip =
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide';

export function IdentityVerifiedBadge() {
  return (
    <span
      className={`${chip} bg-success/15 text-success`}
      title="Identity verified by VouchPlay admin"
    >
      <ShieldCheck size={12} aria-hidden />
      ID Verified
    </span>
  );
}

export function SkillVerifiedBadge() {
  return (
    <span
      className={`${chip} bg-primary/15 text-primary`}
      title="Skill Verified - meets the community-verification threshold (does not affect vouch weight)"
    >
      <BadgeCheck size={12} aria-hidden />
      Skill Verified
    </span>
  );
}

export function CoachBadge() {
  return (
    <span className={`${chip} bg-accent-cyan/15 text-accent-cyan`} title="Approved Coach">
      <GraduationCap size={12} aria-hidden />
      Coach
    </span>
  );
}

/**
 * "Coach-vouched" chip (master_plan §2AO D2): a coach has vouched for this player's skill. Deliberately
 * NOT called "Coach verified" - Identity-Verified and Skill-Verified are already two LOCKED, separate
 * concepts, and a coach's vouch verifies neither. Shown when `player_skill_profiles.coach_vouch_count
 * > 0` (the caller derives this from the DTO, never from a per-card query).
 */
export function CoachVouchedBadge() {
  return (
    <span
      className={`${chip} bg-accent-cyan/15 text-accent-cyan`}
      title="A coach has vouched for this player's skill"
    >
      <Medal size={12} aria-hidden />
      Coach-vouched
    </span>
  );
}

/**
 * "New" pill (master_plan §2AG A3, D5): onboarded within the admin `new_account_badge_days` window.
 * Deliberately a NEUTRAL border/surface pill, not a semantic colour - it is a welcome, not a warning,
 * and it fades on its own as the account ages past the window.
 */
export function NewBadge() {
  return (
    <span
      className={`${chip} border-border bg-surface text-foreground-muted border`}
      title="Joined recently"
    >
      New
    </span>
  );
}

/**
 * Own-profile-only chip (master_plan §2AG Phase C): a submitted identity verification is waiting on
 * staff review. Never rendered for anyone but the player themself - the caller gates this, the chip
 * itself carries no privacy logic - and never reveals the document.
 */
export function PendingIdentityBadge() {
  return (
    <span
      className={`${chip} border-border bg-surface text-foreground-muted border`}
      title="Only you can see this - your ID is waiting for staff review"
    >
      <Clock size={12} aria-hidden />
      ID pending review
    </span>
  );
}

export function OrganizerBadge() {
  return (
    <span className={`${chip} bg-warning/15 text-warning`} title="Approved Organizer">
      <Trophy size={12} aria-hidden />
      Organizer
    </span>
  );
}

export function LookingForPartnerBadge() {
  return (
    <span className={`${chip} bg-accent-lime/15`} style={{ color: 'var(--accent-lime)' }}>
      <UserSearch size={12} aria-hidden />
      Looking for partner
    </span>
  );
}

export function OpenForSponsorshipBadge() {
  return (
    <span className={`${chip} bg-primary/10 text-primary`}>
      <Handshake size={12} aria-hidden />
      Open to sponsorship
    </span>
  );
}

export function SexBadge({
  sex,
  symbolOnly = false,
}: {
  sex: 'male' | 'female' | null;
  /**
   * Compact rows show the symbol alone: the word costs width the player's name needs, and the
   * symbol is already the convention on every draw sheet. The name stays available to screen
   * readers, so nothing is lost for anyone who cannot see the glyph.
   */
  symbolOnly?: boolean;
}) {
  if (!sex) return null;
  const male = sex === 'male';
  if (symbolOnly) {
    return (
      <span
        className={male ? 'text-sky-600 dark:text-sky-400' : 'text-pink-600 dark:text-pink-400'}
        title={male ? 'Male' : 'Female'}
      >
        <span aria-hidden>{male ? '♂' : '♀'}</span>
        <span className="sr-only">{male ? 'Male' : 'Female'}</span>
      </span>
    );
  }
  return (
    <span
      className={`${chip} ${male ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-pink-500/15 text-pink-600 dark:text-pink-400'}`}
      title={male ? 'Male' : 'Female'}
    >
      <span aria-hidden>{male ? '♂' : '♀'}</span>
      {male ? 'Male' : 'Female'}
    </span>
  );
}
