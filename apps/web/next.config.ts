import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Public, privacy-safe build identifier for client error telemetry (short commit SHA on Vercel).
  env: { NEXT_PUBLIC_DEPLOY_VERSION: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev' },
  // Lint runs as its own CI step; don't let it gate the production build (Next 15 lints on build).
  eslint: { ignoreDuringBuilds: true },
  // Server Actions handle file uploads (avatars 2MB, club logos 2MB, tournament covers 4MB, payment
  // proofs 5MB). Next's default action body limit is 1MB, which errored those uploads - raise it.
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
  // Domain logic lives in workspace packages; transpile them for the app.
  transpilePackages: [
    '@vouchplay/core',
    '@vouchplay/db',
    '@vouchplay/ui',
    '@vouchplay/config',
    '@vouchplay/validation',
    '@vouchplay/analytics',
  ],
  images: {
    // Constrain to a small allowed set of widths (handover §34A.10).
    deviceSizes: [360, 640, 828, 1080, 1200],
    imageSizes: [48, 96, 200],
    formats: ['image/avif', 'image/webp'],
  },
  async redirects() {
    return [
      {
        // Registration for B-Steel Hermosa 2026 is open, so the front door is the tournament list,
        // not the leaderboards (master_plan §2E). Everyone who opens the app link lands one tap
        // from entering. The Home surface is unchanged and still its own tab, at /home.
        //
        // `permanent: false` on purpose: this is a campaign default with an end date, and a 308
        // would be cached by browsers long after the event. To revert, delete this rule and point
        // the Home nav item back at '/'.
        source: '/',
        destination: '/tournaments',
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        // Baseline security headers (handover §45). CSP is added per-route later.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
