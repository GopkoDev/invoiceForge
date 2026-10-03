// Unit + component + contract tests: no database, no containers (test:unit).
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // Default environment is 'node' (unit/contract need no DOM); component tests opt into
    // jsdom per file via a `// @vitest-environment jsdom` docblock.
    environment: 'node',
    // next-auth's root entry imports 'next/server' without an extension, which Node's ESM
    // resolver refuses; inlining lets Vite resolve it, so the real Auth.js error classes load.
    server: { deps: { inline: ['next-auth'] } },
    setupFiles: ['tests/support/setup.ts'],
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/component/**/*.test.{ts,tsx}',
      'tests/contract/**/*.test.{ts,tsx}',
    ],
    exclude: ['tests/integration/**', 'tests/e2e/**', 'node_modules/**'],
  },
});
