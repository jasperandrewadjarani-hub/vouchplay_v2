import type { MetadataRoute } from 'next';
import { BRAND, THEME_COLORS } from '@vouchplay/config';

/** PWA manifest (handover §44.1, master_plan §2AY decision A). Served at /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.tagline,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Pure black (not the app's #080d17 surface): the install splash centers the icon on this colour,
    // and the icons are rendered neon-on-#000 (§2AZ), so black keeps the icon edge seamless. theme_color
    // (the status-bar tint) stays the app surface colour.
    background_color: '#000000',
    theme_color: THEME_COLORS.darkBackground,
    orientation: 'portrait',
    categories: ['sports', 'social'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
