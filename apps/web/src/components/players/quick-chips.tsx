import Link from 'next/link';
import { Check } from 'lucide-react';
import { playerFiltersToQuery, type PlayerFilters } from '@/lib/players/filters';
import type { BadgeFilterOption } from '@/lib/badges/queries';
import { BadgeHoldersChip } from './badge-filter-sheet';

/**
 * Quick filter chips (master_plan §2BK F, neon selected state per §2BL D), sitting under
 * search/filters for a signed-in viewer: one tap toggles of the same URL filters `SearchFilters`
 * already understands - never a parallel state, so a chip and the full filter sheet can never
 * disagree about what is applied. Server component: plain links with the next URL already computed,
 * no client state needed for a toggle. The one exception is the gold "Badge holders" chip, which
 * opens a bottom sheet and so needs its own small client island (`BadgeHoldersChip`).
 */

/** Selected = solid neon cyan fill with dark text, a check mark and a soft glow ring (§2BL D) - must
 *  read clearly in both themes, so the fill itself carries the contrast rather than a border/theme
 *  token. Unselected is unchanged from before. */
const NEON_SELECTED =
  'border-cyan-200 bg-gradient-to-br from-cyan-300 to-cyan-400 text-cyan-950 shadow-[0_0_0_3px_rgba(34,211,238,0.22),0_6px_18px_-6px_rgba(34,211,238,0.7)]';
const UNSELECTED = 'border-border bg-surface text-foreground-muted hover:text-foreground';

export function QuickChips({
  current,
  compact,
  myLevelOrdinal,
  myLevelLabel,
  myCity,
  myCityLabel,
  badgeOptions,
}: {
  current: PlayerFilters;
  compact: boolean;
  /** The viewer's community band ordinal, falling back to self-rated (master_plan §2BK F) - null
   *  hides the chip entirely (neither rating exists yet). */
  myLevelOrdinal: number | null;
  myLevelLabel: string | null;
  /** Normalised city key (§2B `normalizeCityKey`) - null hides the chip (no city on the profile). */
  myCity: string | null;
  myCityLabel: string | null;
  /** Catalog + held event badges with live holder counts (§2BL C) - empty hides the "Badge holders"
   *  chip entirely (signed-out viewers never receive this prop from the page in the first place). */
  badgeOptions: BadgeFilterOption[];
}) {
  const hrefFor = (patch: Partial<PlayerFilters>) =>
    `/players${playerFiltersToQuery({ ...current, ...patch, page: 1 }, { compact, page: 1 })}`;

  const myLevelOn =
    myLevelOrdinal != null && current.skills?.length === 1 && current.skills[0] === myLevelOrdinal;
  const nearMeOn = myCity != null && current.city === myCity;
  const lookingOn = Boolean(current.lookingForPartner);
  const coachOn = Boolean(current.coach);

  const chips: { key: string; label: string; on: boolean; href: string }[] = [];
  if (myLevelOrdinal != null) {
    chips.push({
      key: 'level',
      label: myLevelLabel ?? 'My level',
      on: myLevelOn,
      href: hrefFor({ skills: myLevelOn ? undefined : [myLevelOrdinal] }),
    });
  }
  if (myCity != null) {
    chips.push({
      key: 'near',
      label: myCityLabel ? `Near ${myCityLabel}` : 'Near me',
      on: nearMeOn,
      href: hrefFor({ city: nearMeOn ? undefined : myCity }),
    });
  }
  chips.push({
    key: 'looking',
    label: 'Looking for partner',
    on: lookingOn,
    href: hrefFor({ lookingForPartner: lookingOn ? undefined : true }),
  });
  chips.push({
    key: 'coach',
    label: 'Coaches',
    on: coachOn,
    href: hrefFor({ coach: coachOn ? undefined : true }),
  });

  return (
    <div
      className="flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label="Quick filters"
    >
      {/* First in the row, signed-in only (§2BL C) - `badgeOptions` is only ever non-empty for a
          signed-in viewer (the page fetches it only when `authed`), so an empty list already hides
          this correctly without a separate flag. */}
      {badgeOptions.length > 0 && (
        <BadgeHoldersChip current={current} compact={compact} options={badgeOptions} />
      )}
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          aria-pressed={c.on}
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            c.on ? NEON_SELECTED : UNSELECTED
          }`}
        >
          {c.on && <Check size={13} strokeWidth={3} aria-hidden />}
          {c.label}
        </Link>
      ))}
    </div>
  );
}
