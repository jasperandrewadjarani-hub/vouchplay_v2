#!/usr/bin/env node
/**
 * PWA icon generator (master_plan §2AY decision A).
 *
 * Why emblem-only: `public/brand/vouchplay-logo.png` is 1254x1254 with the ring + V + pickleball
 * emblem in the top portion and the "VouchPlay" wordmark directly underneath it. The wordmark is
 * unreadable at icon sizes (down to 96px, or ~40px as rendered on an Android home screen), so every
 * generated icon uses the emblem alone, cropped off just below the V's bottom tip (source row 958 of
 * 1254) and then trimmed of its transparent margins.
 *
 * Why a safe zone for the maskable icon: Android (and some launchers) crop a maskable icon to an
 * arbitrary shape (circle, squircle, rounded square, ...) using only the inner 80% "safe zone" of the
 * canvas as the guaranteed-visible area (https://web.dev/articles/maskable-icon). Fitting the emblem
 * to ~62% of the canvas keeps it well inside that circle with margin to spare; the non-maskable icons
 * use ~86% instead since nothing crops them.
 *
 * Outputs (all PNG, opaque dark background unless noted):
 *   apps/web/public/icons/icon-192.png          192x192, emblem @ ~86%
 *   apps/web/public/icons/icon-512.png          512x512, emblem @ ~86%
 *   apps/web/public/icons/icon-maskable-512.png 512x512, emblem @ ~62% (maskable safe zone)
 *   apps/web/public/icons/badge-96.png          96x96,   white silhouette, TRANSPARENT background
 *                                                (Android status-bar push badge)
 *   apps/web/src/app/icon.png                   96x96,   emblem @ ~86% (Next auto-links as favicon)
 *   apps/web/src/app/apple-icon.png              180x180, emblem @ ~86%, opaque (iOS requires opaque;
 *                                                Next auto-links this as the apple-touch-icon)
 *
 * Idempotent: re-running regenerates every file from the source logo, in place. No state is kept
 * between runs.
 *
 * Usage:
 *   node scripts/generate-pwa-icons.mjs
 *
 * If a future logo revision shifts the emblem/wordmark boundary, adjust EMBLEM_CROP_HEIGHT below (and
 * re-run) rather than hand-editing any output PNG.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_LOGO = path.join(REPO_ROOT, 'apps/web/public/brand/vouchplay-logo.png');

// Brand dark background (packages/config/src/brand.ts THEME_COLORS.darkBackground). Duplicated as a
// literal here (deliberately, not imported) because this is a plain Node script outside the app's
// TS/bundler pipeline - keep in sync if that value ever changes.
const DARK_BACKGROUND = '#080d17';

// Source pixel row (of 1254) below which the "VouchPlay" wordmark begins. Verified against the actual
// source file: the emblem's lowest content (the V's bottom tip) sits at row ~957; the wordmark's
// topmost serifs start at row ~963. 958 sits in that ~5px gap.
const EMBLEM_CROP_HEIGHT = 958;

/** Load the source logo, crop off the wordmark, and trim the remaining transparent margins. */
async function loadEmblem() {
  const meta = await sharp(SOURCE_LOGO).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`Could not read dimensions of ${SOURCE_LOGO}`);
  }
  const croppedHeight = Math.min(EMBLEM_CROP_HEIGHT, meta.height);
  const cropped = await sharp(SOURCE_LOGO)
    .extract({ left: 0, top: 0, width: meta.width, height: croppedHeight })
    .png()
    .toBuffer();
  // trim() removes uniform transparent/near-transparent borders so "fit inside X%" below is measured
  // against the emblem's actual ink, not incidental canvas padding.
  const trimmed = await sharp(cropped).trim({ threshold: 10 }).toBuffer();
  const trimmedMeta = await sharp(trimmed).metadata();
  return { buffer: trimmed, width: trimmedMeta.width, height: trimmedMeta.height };
}

/**
 * Composite the emblem, scaled to `fitFraction` of a `size`x`size` canvas, centered on an opaque
 * `DARK_BACKGROUND` square.
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
      background: DARK_BACKGROUND,
    },
  })
    .composite([{ input: resized, left, top }])
    .flatten({ background: DARK_BACKGROUND }) // guarantee fully opaque output (iOS requires this)
    .png()
    .toBuffer();
}

/**
 * Build the Android status-bar badge: a solid white silhouette (the emblem's alpha channel used as
 * the alpha of a flat white fill) on a transparent canvas, fitted to `fitFraction` of `size`.
 */
async function renderBadge(emblem, size, fitFraction) {
  const targetDim = Math.round(size * fitFraction);
  const alpha = await sharp(emblem.buffer)
    .resize({ width: targetDim, height: targetDim, fit: 'inside' })
    .ensureAlpha()
    .extractChannel(3)
    .toBuffer();
  const alphaMeta = await sharp(alpha).metadata();
  const w = alphaMeta.width ?? targetDim;
  const h = alphaMeta.height ?? targetDim;
  // Base must be a 3-channel (RGB, no alpha) image before joinChannel adds the 4th (alpha) channel -
  // starting from a 4-channel create() would end up with 5 channels, which corrupts the output.
  const white = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .joinChannel(alpha)
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
  console.log(`Loading emblem from ${path.relative(REPO_ROOT, SOURCE_LOGO)} ...`);
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
