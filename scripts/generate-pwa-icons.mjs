#!/usr/bin/env node
/**
 * PWA icon generator (master_plan §2AY decision A; emblem swapped to the rounded V in §2AZ addendum).
 *
 * Source: `apps/web/public/brand/vouchplay-emblem.png` - the rounded, glossy "just the V" emblem
 * (ring + V + pickleball) rendered neon-on-pure-black, 1254x1254, already wordmark-free. This replaced
 * the older sharp-edged `vouchplay-logo.png`, which carried the "VouchPlay" wordmark underneath and so
 * needed a wordmark crop; the rounded emblem needs none.
 *
 * Because the emblem is drawn on solid #000 (no alpha), every opaque icon is composited on a pure-black
 * canvas so the emblem's own black margin melts seamlessly into it - no visible square. The PWA
 * manifest's `background_color` is likewise pinned to #000 so the install splash matches the icon edge.
 *
 * Why a safe zone for the maskable icon: Android (and some launchers) crop a maskable icon to an
 * arbitrary shape (circle, squircle, rounded square, ...) using only the inner 80% "safe zone" of the
 * canvas as the guaranteed-visible area (https://web.dev/articles/maskable-icon). Fitting the emblem
 * to ~62% of the canvas keeps it well inside that circle with margin to spare; the non-maskable icons
 * use ~86% instead since nothing crops them.
 *
 * Outputs (all PNG, opaque pure-black background unless noted):
 *   apps/web/public/icons/icon-192.png          192x192, emblem @ ~86%
 *   apps/web/public/icons/icon-512.png          512x512, emblem @ ~86%
 *   apps/web/public/icons/icon-maskable-512.png 512x512, emblem @ ~62% (maskable safe zone)
 *   apps/web/public/icons/badge-96.png          96x96,   white silhouette, TRANSPARENT background
 *                                                (Android status-bar push badge)
 *   apps/web/src/app/icon.png                   96x96,   emblem @ ~86% (Next auto-links as favicon)
 *   apps/web/src/app/apple-icon.png              180x180, emblem @ ~86%, opaque (iOS requires opaque;
 *                                                Next auto-links this as the apple-touch-icon)
 *
 * Idempotent: re-running regenerates every file from the source emblem, in place. No state is kept
 * between runs.
 *
 * Usage:
 *   node scripts/generate-pwa-icons.mjs
 *
 * To adopt a future emblem revision, replace `vouchplay-emblem.png` and re-run - do not hand-edit any
 * output PNG. If the new emblem is drawn on something other than pure black, revisit ICON_BACKGROUND
 * (and the manifest's background_color) and the badge luminance threshold below.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_EMBLEM = path.join(REPO_ROOT, 'apps/web/public/brand/vouchplay-emblem.png');

// The emblem is drawn on solid #000; opaque icons and the manifest splash use the same pure black so
// the emblem's own margin is invisible. (This is intentionally NOT the app's #080d17 dark surface -
// compositing the opaque-black emblem tile onto #080d17 would show a black square.)
const ICON_BACKGROUND = '#000000';

// Above this 0-255 luminance a source pixel is treated as emblem ink for the monochrome push badge;
// at or below it is background. The neon emblem sits well above, the black ground at ~0, so the gap is
// wide - 45 keeps the glow's dim halo out of the silhouette.
const BADGE_LUMA_THRESHOLD = 45;

/** Load the source emblem and trim its uniform black margin so "fit X%" is measured against the ink. */
async function loadEmblem() {
  const meta = await sharp(SOURCE_EMBLEM).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`Could not read dimensions of ${SOURCE_EMBLEM}`);
  }
  // trim() removes the uniform black border (the corner colour), stopping at the first glow pixel, so
  // the emblem is measured by its actual ink rather than the source's built-in padding.
  const trimmed = await sharp(SOURCE_EMBLEM)
    .trim({ background: ICON_BACKGROUND, threshold: 20 })
    .toBuffer();
  const trimmedMeta = await sharp(trimmed).metadata();
  return { buffer: trimmed, width: trimmedMeta.width, height: trimmedMeta.height };
}

/**
 * Composite the emblem, scaled to `fitFraction` of a `size`x`size` canvas, centered on an opaque
 * pure-black square.
 */
async function renderOpaqueIcon(emblem, size, fitFraction) {
  const targetDim = Math.round(size * fitFraction);
  const resized = await sharp(emblem.buffer)
    .resize({ width: targetDim, height: targetDim, fit: 'inside' })
    .toBuffer();
  const resizedMeta = await sharp(resized).metadata();
  const left = Math.round((size - (resizedMeta.width ?? targetDim)) / 2);
  const top = Math.round((size - (resizedMeta.height ?? targetDim)) / 2);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: ICON_BACKGROUND,
    },
  })
    .composite([{ input: resized, left, top }])
    .flatten({ background: ICON_BACKGROUND }) // guarantee fully opaque output (iOS requires this)
    .png()
    .toBuffer();
}

/**
 * Build the Android status-bar badge: a solid white silhouette on a transparent canvas, fitted to
 * `fitFraction` of `size`. The source has no alpha (it is neon on solid black), so the silhouette mask
 * is derived from luminance - bright emblem ink becomes opaque, the black ground becomes transparent.
 */
async function renderBadge(emblem, size, fitFraction) {
  const targetDim = Math.round(size * fitFraction);
  const mask = await sharp(emblem.buffer)
    .resize({ width: targetDim, height: targetDim, fit: 'inside' })
    .flatten({ background: ICON_BACKGROUND })
    .greyscale()
    .threshold(BADGE_LUMA_THRESHOLD)
    .toColourspace('b-w') // collapse to a single channel so it can serve as an alpha mask
    .toBuffer();
  const maskMeta = await sharp(mask).metadata();
  const w = maskMeta.width ?? targetDim;
  const h = maskMeta.height ?? targetDim;
  // Base must be a 3-channel (RGB, no alpha) image before joinChannel adds the 4th (alpha) channel -
  // starting from a 4-channel create() would end up with 5 channels, which corrupts the output.
  const white = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .joinChannel(mask)
    .png()
    .toBuffer();
  const left = Math.round((size - w) / 2);
  const top = Math.round((size - h) / 2);
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: white, left, top }])
    .png()
    .toBuffer();
}

async function writeFile(buffer, outPath) {
  const { default: fs } = await import('node:fs/promises');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buffer);
  const meta = await sharp(buffer).metadata();
  console.log(`  wrote ${path.relative(REPO_ROOT, outPath)} (${meta.width}x${meta.height})`);
}

async function main() {
  console.log(`Loading emblem from ${path.relative(REPO_ROOT, SOURCE_EMBLEM)} ...`);
  const emblem = await loadEmblem();
  console.log(`  emblem trimmed to ${emblem.width}x${emblem.height}`);

  const iconsDir = path.join(REPO_ROOT, 'apps/web/public/icons');
  const appDir = path.join(REPO_ROOT, 'apps/web/src/app');

  console.log('Generating opaque icons (~86% fit) ...');
  await writeFile(await renderOpaqueIcon(emblem, 192, 0.86), path.join(iconsDir, 'icon-192.png'));
  await writeFile(await renderOpaqueIcon(emblem, 512, 0.86), path.join(iconsDir, 'icon-512.png'));
  await writeFile(await renderOpaqueIcon(emblem, 96, 0.86), path.join(appDir, 'icon.png'));
  await writeFile(await renderOpaqueIcon(emblem, 180, 0.86), path.join(appDir, 'apple-icon.png'));

  console.log('Generating maskable icon (~62% fit, safe zone) ...');
  await writeFile(
    await renderOpaqueIcon(emblem, 512, 0.62),
    path.join(iconsDir, 'icon-maskable-512.png'),
  );

  console.log('Generating status-bar badge (white silhouette, transparent, ~90% fit) ...');
  await writeFile(await renderBadge(emblem, 96, 0.9), path.join(iconsDir, 'badge-96.png'));

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
