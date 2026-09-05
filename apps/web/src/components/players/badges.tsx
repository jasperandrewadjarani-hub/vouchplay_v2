import {
  BadgeCheck,
  ShieldCheck,
  Handshake,
  UserSearch,
  GraduationCap,
  Trophy,
} from 'lucide-react';
import type { SkillBand } from '@vouchplay/config';

/**
 * Skill pill: named, color-coded skill band with a source label. Community Skill and Self-Rated are
 * DISTINCT concepts (§3.3) — the label makes clear which one is shown. Never derived from STS.
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
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${pad}`}
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
 * STS chip (Skill-Trust Score, 0–5 confidence). Shown only when computed. Purely informational —
 * VouchPlay never ranks players by STS (§6, §8.4).
 */
export function StsChip({ sts }: { sts: number | null }) {
  if (sts == null) return null;
  return (
    <span
      className="border-border text-foreground-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      title="Skill-Trust Score — confidence in this player's community skill (0–5). Not a ranking."
    >
      STS {sts.toFixed(1)}
    </span>
  );
}

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
      title="Skill Verified — meets the community-verification threshold (does not affect vouch weight)"
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

export function SexBadge({ sex }: { sex: 'male' | 'female' | null }) {
  if (!sex) return null;
  const male = sex === 'male';
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
