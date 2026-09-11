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
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
