// eslint-config-next v15 is eslintrc-format, consumed via FlatCompat (not the v16 flat import).
// (The project is pinned to Next 15 as a Vercel-deploy workaround — see CLAUDE.md.)
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
];

export default eslintConfig;
