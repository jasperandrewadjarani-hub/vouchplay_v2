import {
  BadgeCheck,
  ShieldCheck,
  Handshake,
  UserSearch,
  GraduationCap,
  Trophy,
  Clock,
  Medal,
  Lock,
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

/**
 * Mars / Venus as inline SVGs, lucide-style (master_plan §2BC decision C): the pinned lucide 0.469
 * has no Mars/Venus icon, and the raw ♂ / ♀ text glyphs they replace fall back to Apple Color Emoji
 * metrics on iOS WebKit - a taller ascent and different baseline than every sibling 13px lucide SVG,
 * which is what misaligned the sex icon on iPhones (Safari and the installed app) while Chrome/Android
 * drew the same glyphs from the text font and looked fine. An SVG with the same viewBox and stroke
 * conventions as the rest of the icon set renders identically on every platform - no font fallback.
 */
function MarsIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="10" cy="14" r="5" />
      <line x1="14" y1="10" x2="20" y2="4" />
      <polyline points="15 4 20 4 20 9" />
    </svg>
  );
}

function VenusIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="9" r="5" />
      <line x1="12" y1="14" x2="12" y2="21" />
      <line x1="9" y1="18" x2="15" y2="18" />
    </svg>
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
  const Icon = male ? MarsIcon : VenusIcon;
  if (symbolOnly) {
    return (
      <span
        className={`inline-flex shrink-0 items-center ${male ? 'text-sky-600 dark:text-sky-400' : 'text-pink-600 dark:text-pink-400'}`}
        title={male ? 'Male' : 'Female'}
      >
        <Icon size={13} />
        <span className="sr-only">{male ? 'Male' : 'Female'}</span>
      </span>
    );
  }
  return (
    <span
      className={`${chip} ${male ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-pink-500/15 text-pink-600 dark:text-pink-400'}`}
      title={male ? 'Male' : 'Female'}
    >
      <Icon size={11} />
      {male ? 'Male' : 'Female'}
    </span>
  );
}

/**
 * "Ratings private" (master_plan §2AW): stands in for the community and/or self-rated chip when the
 * player hides them from the public. `own` renders the owner's reminder that they still see theirs.
 */
export function RatingsPrivateChip({ own = false }: { own?: boolean }) {
  return (
    <span
      className={`${chip} bg-surface-muted text-foreground-muted border-border border`}
      title={
        own
          ? 'Only you, tournament organizers and staff can see this rating.'
          : 'This player keeps their ratings private.'
      }
    >
      <Lock size={12} aria-hidden />
      {own ? 'Private' : 'Ratings private'}
    </span>
  );
}

/**
 * Player-card-only "Ratings private" treatment (master_plan §2BK F): sentence case, a quiet 12px
 * lock, no uppercase/tracked pill background - stands in for the tier line itself rather than
 * sitting beside it like `RatingsPrivateChip` does elsewhere. "It reads as a choice the player made,
 * not a warning" (the approved Players tab sample). Deliberately a SEPARATE component rather than a
 * new variant of `RatingsPrivateChip`, so the profile page and partner card - which this lane does
 * not touch - keep their existing pill exactly as it is today.
 */
export function RatingsPrivateInline({ own = false }: { own?: boolean }) {
  return (
    <span
      className="text-foreground-muted inline-flex min-w-0 items-center gap-1 text-xs font-semibold"
      title={
        own
          ? 'Only you, tournament organizers and staff can see this rating.'
          : 'This player keeps their ratings private.'
      }
    >
      <Lock size={12} aria-hidden className="shrink-0" />
      <span className="truncate">{own ? 'Private' : 'Ratings private'}</span>
    </span>
  );
}
