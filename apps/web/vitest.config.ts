import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mirrors tsconfig.json's `@/*` -> `./src/*` path mapping (Next's bundler already understands it;
// Vitest's own resolver does not without this). Needed so a colocated test can import a module that
// itself imports another app module by its `@/...` alias (e.g. `players/dto.ts` -> `@/lib/storage`)
// - every test before this one happened to avoid that by using relative imports only.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` resolves its throwing build by default; Next sets the `react-server` package
      // export condition so it resolves to a no-op there, but Vitest's plain-Node resolver does not
      // set that condition. Alias straight to the package's own no-op build (`empty.js`, the same
      // file the `react-server` condition points at) so a colocated test can import a module that is
      // correctly tagged `import 'server-only'` (e.g. `payments/notification.ts`, §2AK) without every
      // such module needing a client-safe re-export just to be testable.
      'server-only': fileURLToPath(
        new URL('../../node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
