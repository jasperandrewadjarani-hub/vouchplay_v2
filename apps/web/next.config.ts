import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lint runs as its own CI step; don't let it gate the production build (Next 15 lints on build).
  eslint: { ignoreDuringBuilds: true },
  // Server Actions handle file uploads (avatars 2MB, club logos 2MB, tournament covers 4MB, payment
  // proofs 5MB). Next's default action body limit is 1MB, which errored those uploads — raise it.
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
