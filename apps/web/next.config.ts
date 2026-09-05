import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // We maintain our own AGENTS.md/CLAUDE.md conventions; don't auto-generate them per app.
  agentRules: false,
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
