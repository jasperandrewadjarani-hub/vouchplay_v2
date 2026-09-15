import { BADGE_METALS, badgeDef, isEventBadgeKey } from '@vouchplay/config';
import type { BadgeDef, BadgeFamily, BadgeGlyph, BadgeRarity } from '@vouchplay/config';

/**
 * Badge art (master_plan §2BL A, ported faithfully from the approved "Badges in 3D" sample -
 * `badge3D` / `legendSVG` / `mvpSVG` / `ornament` / `METAL`). Every catalog badge (and `event:*`
 * badges, via `badgeDef`) renders as a raised game emblem: extruded metal frame, bevelled recessed
 * core, embossed glyph, gloss sweep, family ornaments and a rarity trim/gem. Legend and MVP are
 * bespoke hero drawings instead of the generic emblem. Below 40px ornaments, the gloss's stronger
 * opacity and the shadow ellipse drop out and the extrusion/glyph get thicker so small badges (player
 * cards, chips) stay legible - see `small` below.
 *
 * Server-safe: no hooks, no client boundary. All markup (frame paths, glyph paths, ornament shapes,
 * hero art) is static, trusted, code-authored SVG - never built from user input - assembled as a
 * string and injected once via `dangerouslySetInnerHTML` on the root `<svg>`, the same pattern this
 * file already used for individual glyphs before this rewrite. Every id used inside a badge's own
 * `<defs>` (gradients, clip path) is derived deterministically from the badge key + pixel size + a
 * small/large flag, per the lane brief (e.g. `vpb-legend-22-s`) - a plain function component like
 * this can render more than once for the same badge on one page (a badge shown in both a player card
 * row and a case grid), and a fixed/random id would either collide or mismatch between server and
 * client renders. Same key + size always yields the same id and the same gradient stops, so even a
 * same-badge duplicate on one page resolves harmlessly to identical definitions.
 */

type Frame = 'shield' | 'medal' | 'hex' | 'tile' | 'star';

/** 120-unit box frame outlines, ported verbatim from the sample's `FRAMES`. */
const FRAME_PATHS: Record<Frame, string> = {
  shield: 'M60 10 L100 24 V58 C100 82 84 100 60 110 C36 100 20 82 20 58 V24 Z',
  medal: 'M60 12 A48 48 0 1 1 59.99 12 Z',
  hex: 'M60 8 L104 33 V83 L60 108 L16 83 V33 Z',
  tile: 'M34 14 H86 A20 20 0 0 1 106 34 V86 A20 20 0 0 1 86 106 H34 A20 20 0 0 1 14 86 V34 A20 20 0 0 1 34 14 Z',
  star: 'M60 6 L74 38 L109 41 L82 64 L91 99 L60 80 L29 99 L38 64 L11 41 L46 38 Z',
};

const FAMILY_FRAME: Record<BadgeFamily, Frame> = {
  glory: 'shield',
  community: 'medal',
  growth: 'hex',
  roles: 'tile',
  special: 'star',
};

/** Glyphs on a 120-unit box centred on (60,60), ported verbatim from the sample's `G`. `og` is
 *  handled separately as embossed lettering (see `ogGlyphMarkup`). Static, trusted markup only -
 *  never built from user input. */
const GLYPHS: Partial<Record<BadgeGlyph, string>> = {
  trophy:
    '<path d="M44 38h32v12a16 16 0 0 1-32 0z"/><path d="M76 42h8a8 8 0 0 1-8 11M44 42h-8a8 8 0 0 0 8 11M60 66v10M50 82h20"/>',
  crown: '<path d="M40 74l-4-30 14 12 10-17 10 17 14-12-4 30z"/><path d="M41 82h38"/>',
  medal: '<circle cx="60" cy="67" r="14"/><path d="M50 36l10 17 10-17M60 60v14M54 67h12"/>',
  star: '<path d="M60 36l7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2z"/>',
  hands: '<path d="M36 62l12-12 10 4 10-4 16 14M43 69l7 7M53 67l8 8M62 65l7 7"/>',
  calendar:
    '<rect x="40" y="42" width="40" height="36" rx="5"/><path d="M40 53h40M50 37v9M70 37v9M50 65l6 6 12-12"/>',
  spark: '<path d="M60 34l6 18 18 6-18 6-6 18-6-18-18-6 18-6z"/>',
  voice: '<path d="M36 42h48v26H56l-11 9v-9h-9z"/><path d="M49 55l7 6 13-12"/>',
  flag: '<path d="M46 84V36M46 38h32l-7 11 7 11H46"/>',
  captain: '<path d="M70 43a18 18 0 1 0 0 34"/>',
  rings: '<circle cx="52" cy="60" r="13"/><circle cx="68" cy="60" r="13"/>',
  trend: '<path d="M36 76l16-16 11 9 21-22"/><path d="M72 47h12v12"/>',
  chevrons: '<path d="M42 70l18-14 18 14M42 56l18-14 18 14"/>',
  proven:
    '<path d="M60 36l19 7v13c0 13-8 21-19 26-11-5-19-13-19-26V43z"/><path d="M51 60l6 6 11-12"/>',
  cap: '<path d="M34 53l26-12 26 12-26 12z"/><path d="M46 59v11c9 6 19 6 28 0V59M86 53v14"/>',
  clipboard:
    '<rect x="42" y="38" width="36" height="44" rx="5"/><path d="M51 36h18v8H51zM50 57h20M50 67h13"/>',
  whistle: '<circle cx="55" cy="66" r="13"/><path d="M62 54l22-7v10l-15 5"/>',
  megaphone:
    '<path d="M38 55v12h9l24 12V43L47 55z"/><path d="M47 67l4 12h7l-3-11M78 52a10 10 0 0 1 0 18"/>',
  laurel:
    '<path d="M60 84c-17-3-26-16-26-31M60 84c17-3 26-16 26-31"/><path d="M36 60l-6-4M37 70h-7M42 77l-5 5M84 60l6-4M83 70h7M78 77l5 5"/><path d="M50 43l10-10 10 10-10 14z"/>',
  gem: '<path d="M42 48h36l9 11-27 26-27-26z"/><path d="M42 48l18 37 18-37M33 59h54"/>',
  ticket:
    '<path d="M36 45h48v10a6 6 0 0 0 0 12v10H36V67a6 6 0 0 0 0-12z"/><path d="M60 48v5M60 59v5M60 70v5"/>',
};

/** Falls back to the app's display font CSS variable if one exists; this app has none (only a body
 *  `--font-sans`), so LEGEND/MVP/OG text use the sample's own fallback stack. */
const DISPLAY_FONT = "Impact, 'Arial Black', system-ui, sans-serif";

function sanitizeId(key: string): string {
  return key.replace(/[^a-zA-Z0-9-]/g, '-');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Diamond gem marker, ported verbatim from the sample's `gem(x,y,s,c1,c2)`. */
function gemMarkup(x: number, y: number, s: number, c1: string, c2: string): string {
  return (
    `<polygon points="${x},${y - s} ${x + s * 0.8},${y} ${x},${y + s} ${x - s * 0.8},${y}" fill="${c2}" stroke="#fff3bf" stroke-width="1.5"/>` +
    `<polygon points="${x},${y - s} ${x + s * 0.8},${y} ${x},${y}" fill="${c1}" opacity=".85"/>`
  );
}

/** Family + rarity ornaments (wings/ribbon, ribbon tails, crystal facets, corner rivets, light rays,
 *  epic gem, legendary gold wings + gem + sparkle), ported verbatim from the sample's `ornament()`.
 *  Never drawn below 40px (see `emblemMarkup`). */
function ornamentMarkup(
  family: BadgeFamily,
  rarity: BadgeRarity,
  id: string,
  hi: string,
  lo: string,
  deep: string,
): { back: string; front: string } {
  let back = '';
  let front = '';

  if (family === 'glory') {
    back +=
      `<path d="M22 34 C8 36 2 46 2 58 C10 52 16 50 22 52 Z" fill="${lo}" stroke="${deep}" stroke-width="1.5"/>` +
      `<path d="M98 34 C112 36 118 46 118 58 C110 52 104 50 98 52 Z" fill="${lo}" stroke="${deep}" stroke-width="1.5"/>`;
    front +=
      `<path d="M34 100 L44 92 H76 L86 100 L76 108 H44 Z" fill="#b91c1c" stroke="#5f0a0a" stroke-width="2"/>` +
      `<path d="M44 94 H76" stroke="#fca5a5" stroke-width="1.5" opacity=".6"/>`;
  }
  if (family === 'community') {
    back +=
      `<path d="M40 96 L32 118 L44 112 L50 120 L56 100 Z" fill="${lo}" stroke="${deep}" stroke-width="1.5"/>` +
      `<path d="M80 96 L88 118 L76 112 L70 120 L64 100 Z" fill="${lo}" stroke="${deep}" stroke-width="1.5"/>`;
  }
  if (family === 'growth') {
    front += `<path d="M60 8 L60 32 M104 33 L82 45 M16 33 L38 45 M60 108 L60 90" stroke="${hi}" stroke-opacity=".35" stroke-width="1.5"/>`;
  }
  if (family === 'roles') {
    front += [
      [26, 26],
      [94, 26],
      [26, 94],
      [94, 94],
    ]
      .map(
        ([x, y]) =>
          `<circle cx="${x}" cy="${y}" r="3.6" fill="${hi}" stroke="${deep}" stroke-width="1.5"/>`,
      )
      .join('');
  }
  if (family === 'special') {
    back += `<g opacity=".55">${[0, 45, 90, 135]
      .map(
        (a) =>
          `<rect x="58" y="-2" width="4" height="124" rx="2" fill="${hi}" transform="rotate(${a} 60 60)" opacity=".35"/>`,
      )
      .join('')}</g>`;
  }
  if (rarity === 'epic') {
    front += gemMarkup(60, 14, 7, '#e0f2fe', '#2563eb');
  }
  if (rarity === 'legendary') {
    back +=
      `<path d="M20 44 C4 40 -2 54 0 66 C8 60 14 60 22 62 C12 66 8 72 8 80 C16 74 22 72 28 72 Z" fill="url(#${id}-gt)" stroke="#6b3d05" stroke-width="1.5"/>` +
      `<path d="M100 44 C116 40 122 54 120 66 C112 60 106 60 98 62 C108 66 112 72 112 80 C104 74 98 72 92 72 Z" fill="url(#${id}-gt)" stroke="#6b3d05" stroke-width="1.5"/>`;
    front +=
      gemMarkup(60, 13, 8, '#fde68a', '#dc2626') +
      `<path d="M96 22 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#fff" opacity=".9"/>`;
  }

  return { back, front };
}

/** Embossed glyph: a dark shadow stroke, then a bright white→hi→mid gradient stroke on top. */
function embossedGlyphMarkup(
  glyph: BadgeGlyph,
  id: string,
  deep: string,
  glyphWidth: number,
): string {
  const path = GLYPHS[glyph] ?? '';
  return (
    `<g fill="none" stroke="${deep}" stroke-width="${glyphWidth + 2}" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 2.5)" opacity=".85">${path}</g>` +
    `<g fill="none" stroke="url(#${id}-em)" stroke-width="${glyphWidth}" stroke-linecap="round" stroke-linejoin="round">${path}</g>`
  );
}

/** OG's glyph is embossed "OG" lettering instead of a stroked path. */
function ogGlyphMarkup(id: string, deep: string, lo: string, family: BadgeFamily): string {
  const y = FAMILY_FRAME[family] === 'shield' ? 72 : 73;
  return (
    `<text x="60" y="${y}" text-anchor="middle" font-family="${DISPLAY_FONT}" font-weight="800" font-size="38" fill="${deep}" transform="translate(0 2.5)">OG</text>` +
    `<text x="60" y="${y}" text-anchor="middle" font-family="${DISPLAY_FONT}" font-weight="800" font-size="38" fill="url(#${id}-em)" stroke="${lo}" stroke-width="1.5" paint-order="stroke">OG</text>`
  );
}

/** The generic 3D emblem recipe (every badge except Legend/MVP), ported verbatim from the sample's
 *  `badge3D`: drop shadow → extruded frame → face (4-stop gradient + rarity trim) → recessed core
 *  (80%, radial, with a highlight and shadow edge) → embossed glyph → clipped gloss sweep → family +
 *  rarity ornaments. */
function emblemMarkup(def: BadgeDef, size: number, id: string): string {
  const [hi, mid, lo, deep] = BADGE_METALS[def.metal];
  const frame = FRAME_PATHS[FAMILY_FRAME[def.family]];
  const small = size < 40;
  const depth = small ? 4 : 7;
  const rarity = def.rarity;
  const trim =
    rarity === 'legendary'
      ? `url(#${id}-gt)`
      : rarity === 'epic'
        ? hi
        : rarity === 'rare'
          ? '#e2e8f0'
          : lo;
  const glyphWidth = small ? 9 : 6.5;
  const orn = small
    ? { back: '', front: '' }
    : ornamentMarkup(def.family, rarity, id, hi, lo, deep);
  const glyph =
    def.glyph === 'og'
      ? ogGlyphMarkup(id, deep, lo, def.family)
      : embossedGlyphMarkup(def.glyph, id, deep, glyphWidth);

  return (
    `<defs>` +
    `<linearGradient id="${id}-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".28" stop-color="${mid}"/><stop offset=".78" stop-color="${lo}"/><stop offset="1" stop-color="${deep}"/></linearGradient>` +
    `<radialGradient id="${id}-core" cx=".5" cy=".38" r=".62"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></radialGradient>` +
    `<linearGradient id="${id}-em" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="${hi}"/><stop offset="1" stop-color="${mid}"/></linearGradient>` +
    `<linearGradient id="${id}-gt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff7d1"/><stop offset=".4" stop-color="#f5b82e"/><stop offset=".55" stop-color="#fffbe6"/><stop offset="1" stop-color="#a1600a"/></linearGradient>` +
    `<clipPath id="${id}-c"><path d="${frame}"/></clipPath>` +
    `</defs>` +
    (small ? '' : `<ellipse cx="60" cy="112" rx="34" ry="5" fill="#000" opacity=".35"/>`) +
    orn.back +
    `<path d="${frame}" fill="${deep}" transform="translate(0 ${depth})"/>` +
    `<path d="${frame}" fill="url(#${id}-f)" stroke="${trim}" stroke-width="${rarity === 'common' ? 2.5 : 4.5}" stroke-linejoin="round"/>` +
    `<path d="${frame}" fill="url(#${id}-core)" transform="translate(60 60) scale(.8) translate(-60 -60)"/>` +
    `<path d="${frame}" fill="none" stroke="${hi}" stroke-opacity=".7" stroke-width="2" transform="translate(60 60) scale(.8) translate(-60 -60)"/>` +
    `<path d="${frame}" fill="none" stroke="${deep}" stroke-opacity=".55" stroke-width="2" transform="translate(60 61.5) scale(.8) translate(-60 -60)"/>` +
    glyph +
    `<g clip-path="url(#${id}-c)"><ellipse cx="46" cy="18" rx="46" ry="24" fill="#fff" opacity="${small ? '.14' : '.22'}"/></g>` +
    orn.front
  );
}

/** Legend's bespoke hero drawing (bevelled gold octagon, dark core, red standard, copper wings,
 *  sapphire gems, silver lettering), ported verbatim from the sample's `legendSVG`, plus its own
 *  under-40px variant. */
function legendMarkup(size: number, id: string): string {
  if (size < 40) {
    return (
      `<defs>` +
      `<linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".45" stop-color="#f5b82e"/><stop offset="1" stop-color="#9a5a0b"/></linearGradient>` +
      `<linearGradient id="${id}-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ec5ff"/><stop offset=".5" stop-color="#2563eb"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient>` +
      `</defs>` +
      `<polygon points="30,8 70,8 96,34 96,74 70,100 30,100 4,74 4,34" fill="#5c3306"/>` +
      `<polygon points="30,4 70,4 96,30 96,70 70,96 30,96 4,70 4,30" fill="url(#${id}-g)" stroke="#5c3306" stroke-width="3"/>` +
      `<polygon points="35,17 65,17 83,35 83,65 65,83 35,83 17,65 17,35" fill="#231a14"/>` +
      `<path d="M28 62 L28 38 L39 49 L50 32 L61 49 L72 38 L72 62 Z" fill="url(#${id}-g)" stroke="#5c3306" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<polygon points="50,66 58,74 50,84 42,74" fill="url(#${id}-b)" stroke="#fde68a" stroke-width="2"/>`
    );
  }
  return (
    `<defs>` +
    `<linearGradient id="${id}-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4c2"/><stop offset=".35" stop-color="#f6c343"/><stop offset=".7" stop-color="#c7851a"/><stop offset="1" stop-color="#7a4608"/></linearGradient>` +
    `<linearGradient id="${id}-goldD" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9771a"/><stop offset="1" stop-color="#5c3306"/></linearGradient>` +
    `<linearGradient id="${id}-core" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2c1f"/><stop offset="1" stop-color="#150e09"/></linearGradient>` +
    `<linearGradient id="${id}-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a6e"/><stop offset="1" stop-color="#a3172b"/></linearGradient>` +
    `<linearGradient id="${id}-copper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd2b0"/><stop offset=".5" stop-color="#d98552"/><stop offset="1" stop-color="#7a3a17"/></linearGradient>` +
    `<linearGradient id="${id}-gem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c7dcff"/><stop offset=".45" stop-color="#2f6bff"/><stop offset="1" stop-color="#16307a"/></linearGradient>` +
    `<linearGradient id="${id}-silver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#e7dcf2"/><stop offset="1" stop-color="#b9a7cc"/></linearGradient>` +
    `</defs>` +
    `<ellipse cx="120" cy="228" rx="70" ry="8" fill="#000" opacity=".35"/>` +
    `<polygon points="72,28 168,28 222,82 222,178 168,232 72,232 18,178 18,82" fill="#4a2a05"/>` +
    `<polygon points="72,18 168,18 222,72 222,168 168,222 72,222 18,168 18,72" fill="url(#${id}-goldD)"/>` +
    `<polygon points="74,24 166,24 216,74 216,166 166,216 74,216 24,166 24,74" fill="url(#${id}-gold)"/>` +
    `<polygon points="82,40 158,40 200,82 200,158 158,200 82,200 40,158 40,82" fill="url(#${id}-goldD)"/>` +
    `<polygon points="86,46 154,46 194,86 194,154 154,194 86,194 46,154 46,86" fill="url(#${id}-core)"/>` +
    `<path d="M40 120 L14 102 L30 120 L14 138 Z" fill="url(#${id}-gold)"/><path d="M200 120 L226 102 L210 120 L226 138 Z" fill="url(#${id}-gold)"/>` +
    `<path d="M92 60 H148 V132 L120 116 L92 132 Z" fill="url(#${id}-red)" stroke="#5a0b16" stroke-width="3"/>` +
    `<path d="M118 62 C98 48 74 44 56 48 C70 54 80 60 88 70 C76 66 66 66 58 70 C74 74 88 80 100 88 Z" fill="url(#${id}-copper)" stroke="#6b2f10" stroke-width="2"/>` +
    `<path d="M122 62 C142 48 166 44 184 48 C170 54 160 60 152 70 C164 66 174 66 182 70 C166 74 152 80 140 88 Z" fill="url(#${id}-copper)" stroke="#6b2f10" stroke-width="2"/>` +
    `<polygon points="120,54 134,70 120,88 106,70" fill="url(#${id}-gold)" stroke="#6b3d07" stroke-width="2"/><polygon points="120,59 130,70 120,82 110,70" fill="url(#${id}-gem)"/>` +
    `<path d="M118 176 C100 166 84 150 76 132 C92 140 106 150 118 162 Z" fill="url(#${id}-gold)" stroke="#6b3d07" stroke-width="2"/>` +
    `<path d="M122 176 C140 166 156 150 164 132 C148 140 134 150 122 162 Z" fill="url(#${id}-gold)" stroke="#6b3d07" stroke-width="2"/>` +
    `<polygon points="120,154 138,176 120,200 102,176" fill="url(#${id}-gold)" stroke="#6b3d07" stroke-width="2.5"/><polygon points="120,161 131,176 120,192 109,176" fill="url(#${id}-gem)"/>` +
    `<text x="120" y="148" text-anchor="middle" font-family="${DISPLAY_FONT}" font-weight="800" font-size="47" letter-spacing="-1" fill="#5c3306">LEGEND</text>` +
    `<text x="120" y="144" text-anchor="middle" font-family="${DISPLAY_FONT}" font-weight="800" font-size="47" letter-spacing="-1" fill="url(#${id}-silver)" stroke="#c7851a" stroke-width="2.5" paint-order="stroke">LEGEND</text>` +
    `<path d="M74 24 H166 L190 48 C150 40 100 44 52 64 L50 50 Z" fill="#fff" opacity=".14"/>`
  );
}

/** MVP's bespoke hero drawing (crossed swords, gold winged crest, red plaque), ported verbatim from
 *  the sample's `mvpSVG`, plus its own under-40px variant. */
function mvpMarkup(size: number, id: string): string {
  if (size < 40) {
    return (
      `<defs>` +
      `<linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".5" stop-color="#f5a524"/><stop offset="1" stop-color="#a3570a"/></linearGradient>` +
      `<linearGradient id="${id}-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4d4d"/><stop offset="1" stop-color="#a1121c"/></linearGradient>` +
      `</defs>` +
      `<path d="M50 8 L60 34 L96 34 L68 54 L78 84 L50 66 L22 84 L32 54 L4 34 L40 34 Z" fill="#6b3706"/>` +
      `<path d="M50 4 L60 30 L96 30 L68 50 L78 80 L50 62 L22 80 L32 50 L4 30 L40 30 Z" fill="url(#${id}-g)" stroke="#6b3706" stroke-width="3" stroke-linejoin="round"/>` +
      `<rect x="14" y="52" width="72" height="30" rx="7" fill="url(#${id}-r)" stroke="#5a0a10" stroke-width="3"/>` +
      `<text x="50" y="75" text-anchor="middle" font-family="${DISPLAY_FONT}" font-weight="900" font-size="24" fill="#ffd166" stroke="#5a0a10" stroke-width="1.5" paint-order="stroke">MVP</text>`
    );
  }
  const swords = [-1, 1]
    .map(
      (s) =>
        `<g transform="translate(120 120) rotate(${s * 38}) translate(-120 -120)">` +
        `<rect x="104" y="6" width="32" height="24" rx="4" fill="url(#${id}-gold)" stroke="#7a4006" stroke-width="2.5"/>` +
        `<rect x="108" y="30" width="24" height="64" fill="url(#${id}-grip)" stroke="#5c0a0f" stroke-width="2.5"/>` +
        [40, 52, 64, 76]
          .map((y) => `<path d="M108 ${y} H132" stroke="#5c0a0f" stroke-width="2" opacity=".7"/>`)
          .join('') +
        `<polygon points="104,176 136,176 146,196 136,222 104,222 94,196" fill="url(#${id}-steel)" stroke="#4a5360" stroke-width="2.5"/></g>`,
    )
    .join('');
  return (
    `<defs>` +
    `<linearGradient id="${id}-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".4" stop-color="#f8b733"/><stop offset=".75" stop-color="#d9860f"/><stop offset="1" stop-color="#8c4a06"/></linearGradient>` +
    `<linearGradient id="${id}-goldSide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b86a0b"/><stop offset="1" stop-color="#e79a1c"/></linearGradient>` +
    `<linearGradient id="${id}-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5147"/><stop offset=".6" stop-color="#d11f24"/><stop offset="1" stop-color="#8d0d14"/></linearGradient>` +
    `<linearGradient id="${id}-grip" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b3131b"/><stop offset=".5" stop-color="#ef3b3b"/><stop offset="1" stop-color="#9c1017"/></linearGradient>` +
    `<linearGradient id="${id}-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset=".55" stop-color="#b8c2cf"/><stop offset="1" stop-color="#6b7686"/></linearGradient>` +
    `</defs>` +
    `<ellipse cx="120" cy="230" rx="70" ry="8" fill="#000" opacity=".35"/>` +
    swords +
    `<path d="M120 38 L138 86 L120 78 L102 86 Z" fill="url(#${id}-gold)" stroke="#7a4006" stroke-width="2.5"/>` +
    `<path d="M30 96 C52 82 80 80 104 86 L96 104 C74 100 52 102 34 110 Z" fill="url(#${id}-gold)" stroke="#7a4006" stroke-width="2.5"/>` +
    `<path d="M210 96 C188 82 160 80 136 86 L144 104 C166 100 188 102 206 110 Z" fill="url(#${id}-gold)" stroke="#7a4006" stroke-width="2.5"/>` +
    `<path d="M36 150 C56 162 82 166 104 160 L96 142 C76 146 54 144 38 138 Z" fill="url(#${id}-goldSide)" stroke="#7a4006" stroke-width="2.5"/>` +
    `<path d="M204 150 C184 162 158 166 136 160 L144 142 C164 146 186 144 202 138 Z" fill="url(#${id}-goldSide)" stroke="#7a4006" stroke-width="2.5"/>` +
    `<polygon points="120,66 170,96 170,150 120,182 70,150 70,96" fill="url(#${id}-gold)" stroke="#7a4006" stroke-width="3"/>` +
    `<path d="M120 168 L130 194 L120 212 L110 194 Z" fill="url(#${id}-gold)" stroke="#7a4006" stroke-width="2.5"/>` +
    `<rect x="40" y="106" width="160" height="58" rx="12" fill="#6e0a10"/>` +
    `<rect x="40" y="100" width="160" height="58" rx="12" fill="url(#${id}-red)" stroke="#5a0a10" stroke-width="3"/>` +
    `<rect x="46" y="104" width="148" height="14" rx="7" fill="#fff" opacity=".16"/>` +
    `<text x="120" y="150" text-anchor="middle" font-family="${DISPLAY_FONT}" font-weight="900" font-size="48" letter-spacing="1" fill="#6b1405">MVP</text>` +
    `<text x="120" y="147" text-anchor="middle" font-family="${DISPLAY_FONT}" font-weight="900" font-size="48" letter-spacing="1" fill="url(#${id}-gold)" stroke="#7a2a06" stroke-width="2.5" paint-order="stroke">MVP</text>`
  );
}

export function BadgeSymbol({
  badgeKey,
  size = 24,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- accepted-and-ignored, see docstring below.
  number,
  className,
  title,
  muted = false,
}: {
  badgeKey: string;
  size?: number;
  /**
   * @deprecated Pioneer's number is retained in data (`meta.number`, never reissued) but never
   * rendered anywhere in the product anymore (master_plan §2BL B). Kept in the prop type only so
   * other call sites don't need to change; passing it renders nothing.
   */
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
  const ariaLabel = isEvent ? 'Event badge' : `${def.name} badge`;
  const small = size < 40;
  const id = `vpb-${sanitizeId(badgeKey)}-${size}-${small ? 's' : 'l'}`;
  const isHero = def.key === 'legend' || def.key === 'mvp';
  const viewBox = !isHero ? '0 0 120 120' : small ? '0 0 100 100' : '0 0 240 240';

  const inner =
    def.key === 'legend'
      ? legendMarkup(size, id)
      : def.key === 'mvp'
        ? mvpMarkup(size, id)
        : emblemMarkup(def, size, id);
  const titleMarkup = title ? `<title>${escapeXml(title)}</title>` : '';

  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={muted ? { filter: 'grayscale(1) brightness(.55)', opacity: 0.8 } : undefined}
      dangerouslySetInnerHTML={{ __html: titleMarkup + inner }}
    />
  );
}
