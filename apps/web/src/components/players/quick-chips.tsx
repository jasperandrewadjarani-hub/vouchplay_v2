import Link from 'next/link';
import { playerFiltersToQuery, type PlayerFilters } from '@/lib/players/filters';

/**
 * Quick filter chips (master_plan §2BK F), sitting under search/filters for a signed-in viewer: one
 * tap toggles of the same URL filters `SearchFilters` already understands - never a parallel state,
 * so a chip and the full filter sheet can never disagree about what is applied. Server component:
 * plain links with the next URL already computed, no client state needed for a toggle.
 */
export function QuickChips({
  current,
  compact,
  myLevelOrdinal,
  myLevelLabel,
  myCity,
  myCityLabel,
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
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          aria-pressed={c.on}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            c.on
              ? 'border-accent-cyan bg-surface-muted text-foreground'
              : 'border-border bg-surface text-foreground-muted hover:text-foreground'
          }`}
        >
          {c.label}
        </Link>
      ))}
    </div>
  );
}
