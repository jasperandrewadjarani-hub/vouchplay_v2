// eslint-config-next v16 ships a native flat-config array (core-web-vitals + next/typescript).
// Import and spread it directly — do NOT wrap it in FlatCompat (that re-validates flat plugin
// objects as eslintrc and crashes on circular references).
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
  {
    // Register the plugin in the same object that applies its rule (flat-config requirement).
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];

export default eslintConfig;
