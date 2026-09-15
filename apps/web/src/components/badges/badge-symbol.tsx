import { BADGE_FAMILIES, BADGE_METALS, badgeDef, isEventBadgeKey } from '@vouchplay/config';
import type { BadgeFrame, BadgeGlyph } from '@vouchplay/config';

/**
 * Badge art (master_plan §2BK, ported from the approved "VouchPlay Badge Case" sample).
 *
 * Server-safe: no hooks, no client boundary. Every id used inside the SVG's own `<defs>` (gradients)
 * is derived deterministically from the badge key + size + variant, per the lane brief - a plain
 * function component like this can run more than once for the same badge on one page (a badge shown
 * in both a player card row and, say, a case grid), and a fixed/random id would either collide or
 * change between server and client renders. Same key + size + variant always yields the same id, so
 * even a same-badge duplicate on one page resolves to identical gradient stops - harmless.
 */

const FRAME_PATHS: Record<BadgeFrame, string> = {
  shield: 'M50 6 L88 20 V50 C88 72 72 88 50 96 C28 88 12 72 12 50 V20 Z',
  medal: 'M50 6 A44 44 0 1 1 49.99 6 Z',
  hex: 'M50 5 L89 27.5 V72.5 L50 95 L11 72.5 V27.5 Z',
  tile: 'M24 8 H76 A16 16 0 0 1 92 24 V76 A16 16 0 0 1 76 92 H24 A16 16 0 0 1 8 76 V24 A16 16 0 0 1 24 8 Z',
  star: 'M50 3 L62 30 L92 32 L69 52 L77 82 L50 66 L23 82 L31 52 L8 32 L38 30 Z',
};

/** Glyphs drawn in a 100-unit box, stroked in the badge's light tone. Static, trusted markup only -
 *  never built from user input. `og` is handled separately as a monogram (see below). */
const GLYPH_MARKUP: Partial<Record<BadgeGlyph, string>> = {
  trophy:
    '<path d="M36 30h28v10a14 14 0 0 1-28 0z"/><path d="M64 33h7a7 7 0 0 1-7 9M36 33h-7a7 7 0 0 0 7 9M50 54v9M41 68h18"/>',
  laurel:
    '<path d="M50 70c-14-2-22-13-22-26M50 70c14-2 22-13 22-26"/><path d="M30 50l-5-3M31 58l-6 0M35 64l-4 4M70 50l5-3M69 58l6 0M65 64l4 4"/><path d="M42 36l8-8 8 8-8 12z"/>',
  medal: '<circle cx="50" cy="56" r="12"/><path d="M42 30l8 14 8-14M50 50v12M45 57h10"/>',
  star: '<path d="M50 30l6 12 13 2-9.5 9 2.3 13L50 60l-11.8 6 2.3-13L31 44l13-2z"/>',
  hands:
    '<path d="M30 52l10-10 8 3 8-3 14 12M36 58l6 6M44 56l7 7M52 55l6 6M30 52l-2 4M70 54l2 4"/>',
  calendar:
    '<rect x="32" y="34" width="36" height="32" rx="4"/><path d="M32 44h36M41 30v8M59 30v8M42 55l5 5 10-10"/>',
  spark: '<path d="M50 28l5 15 15 5-15 5-5 15-5-15-15-5 15-5z"/>',
  voice: '<path d="M30 36h40v22H46l-9 8v-8h-7z"/><path d="M41 47l6 5 11-10"/>',
  flag: '<path d="M38 70V30M38 32h26l-6 9 6 9H38"/>',
  rings: '<circle cx="43" cy="50" r="11"/><circle cx="57" cy="50" r="11"/>',
  captain: '<path d="M58 36a15 15 0 1 0 0 28"/>',
  trend: '<path d="M30 64l13-13 9 8 18-19"/><path d="M60 40h10v10"/>',
  chevrons: '<path d="M36 58l14-12 14 12M36 46l14-12 14 12"/>',
  proven:
    '<path d="M50 30l16 6v11c0 11-7 18-16 22-9-4-16-11-16-22V36z"/><path d="M43 50l5 5 9-10"/>',
  cap: '<path d="M28 44l22-10 22 10-22 10z"/><path d="M38 49v9c7 5 17 5 24 0v-9M72 44v12"/>',
  clipboard:
    '<rect x="35" y="32" width="30" height="36" rx="4"/><path d="M43 30h14v6H43zM42 47h16M42 55h11"/>',
  whistle: '<circle cx="46" cy="55" r="11"/><path d="M52 45l18-6v8l-12 4M46 55h.5"/>',
  megaphone:
    '<path d="M32 46v10h7l20 10V36L39 46z"/><path d="M39 56l3 10h6l-2-9M65 44a8 8 0 0 1 0 14"/>',
  gem: '<path d="M36 40h28l7 9-21 21-21-21z"/><path d="M36 40l14 30 14-30M29 49h42"/>',
  ticket:
    '<path d="M30 38h40v8a5 5 0 0 0 0 10v8H30v-8a5 5 0 0 0 0-10z"/><path d="M50 40v4M50 49v4M50 58v4"/>',
  crown: '<path d="M32 62l-3-24 12 10 9-14 9 14 12-10-3 24z"/><path d="M33 68h34"/>',
};

function sanitizeId(key: string): string {
  return key.replace(/[^a-zA-Z0-9-]/g, '-');
}

export function BadgeSymbol({
  badgeKey,
  size = 24,
  number,
  className,
  title,
  muted = false,
}: {
  badgeKey: string;
  size?: number;
  /** Prints under the glyph (Pioneer's number). */
  number?: number;
  className?: string;
  /** Optional tooltip text (rendered as an SVG `<title>`). */
  title?: string;
  /** Grayscale + reduced brightness "locked" look, for progress rows. */
  muted?: boolean;
}) {
  const def = badgeDef(badgeKey);
  if (!def) return null;

  const isEvent = isEventBadgeKey(badgeKey);
  const [light, mid, dark] = BADGE_METALS[def.metal];
  const framePath = FRAME_PATHS[BADGE_FAMILIES[def.family].frame];
  const rarity = def.rarity;
  const id = `vpb-${sanitizeId(badgeKey)}-${size}-${muted ? 'm' : 'n'}${number ?? ''}`;
  const rim =
    rarity === 'legendary'
      ? `url(#${id}-rim)`
      : rarity === 'epic'
        ? light
        : rarity === 'rare'
          ? mid
          : dark;
  const glyphWidth = size < 26 ? 7.5 : 5.5;
  const showHalo = rarity === 'epic' || rarity === 'legendary';
  const showInnerRim = rarity === 'rare' || rarity === 'legendary';
  const ariaLabel = isEvent ? 'Event badge' : `${def.name} badge`;
  const numberY = BADGE_FAMILIES[def.family].frame === 'shield' ? 88 : 92;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={muted ? { filter: 'grayscale(1) brightness(.55)', opacity: 0.8 } : undefined}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`${id}-f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset=".45" stopColor="#f59e0b" />
          <stop offset=".55" stopColor="#fff7d6" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
        <radialGradient id={`${id}-s`} cx=".35" cy=".25" r=".8">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {showHalo && (
        <path
          d={framePath}
          fill={mid}
          opacity=".35"
          transform="translate(50 50) scale(1.1) translate(-50 -50)"
        />
      )}
      <path
        d={framePath}
        fill={`url(#${id}-f)`}
        stroke={rim}
        strokeWidth={rarity === 'common' ? 3 : 5}
        strokeLinejoin="round"
      />
      {showInnerRim && (
        <path
          d={framePath}
          fill="none"
          stroke={light}
          strokeOpacity=".55"
          strokeWidth="1.5"
          transform="translate(50 50) scale(.84) translate(-50 -50)"
        />
      )}
      <path d={framePath} fill={`url(#${id}-s)`} />
      {def.glyph === 'og' ? (
        <text
          x="50"
          y="58"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="Manrope, ui-sans-serif, system-ui, sans-serif"
          fontWeight={900}
          fontSize="30"
          fill={light}
        >
          OG
        </text>
      ) : (
        // Static, trusted glyph markup only (never built from user input).
        <g
          fill="none"
          stroke={light}
          strokeWidth={glyphWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          dangerouslySetInnerHTML={{ __html: GLYPH_MARKUP[def.glyph] ?? '' }}
        />
      )}
      {number != null && (
        <text
          x="50"
          y={numberY}
          textAnchor="middle"
          fontFamily="Manrope, ui-sans-serif, system-ui, sans-serif"
          fontWeight={800}
          fontSize="13"
          fill={light}
        >
          #{number}
        </text>
      )}
    </svg>
  );
}
