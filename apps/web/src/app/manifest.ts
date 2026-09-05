import type { MetadataRoute } from 'next';
import { BRAND, THEME_COLORS } from '@vouchplay/config';

/** PWA manifest (handover §44). Served at /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.tagline,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: THEME_COLORS.darkBackground,
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
