/**
 * Brand constants. Theme color tokens live in the app's globals.css (handover §33.2); the values
 * mirrored here are only for places that need them in JS (PWA manifest, meta theme-color).
 */

export const BRAND = {
  name: 'VouchPlay',
  developer: 'JT Consulting & Analytics Inc.',
  jtFacebookUrl: 'https://www.facebook.com/61590234100280/',
  tagline:
    'A community-powered sports identity and tournament platform where your playing profile is built by the people you actually play with.',
} as const;

/** Background colors used by the PWA manifest / theme-color meta, per §33.2. */
export const THEME_COLORS = {
  darkBackground: '#080D17',
  lightBackground: '#F6F8FC',
  primaryBlue: '#2D7CFF',
} as const;

/** Default launch timezone (handover §35.5). */
export const DEFAULT_TIMEZONE = 'Asia/Manila';
