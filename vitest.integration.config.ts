// Integration tests: throwaway Postgres container per suite (test:integration). Never touches
// the .env database - see tests/support/db/env-guard.ts.
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    // next-auth's root entry imports 'next/server' without an extension, which Node's ESM
    // resolver refuses; inlining lets Vite resolve it, so the real Auth.js error classes load.
    server: { deps: { inline: ['next-auth'] } },
    setupFiles: ['tests/support/server-only-mock.ts', 'tests/support/limit-key-env.ts'],
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['node_modules/**'],
    // Container start + `prisma migrate deploy` can take a while on a cold pull.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One container per suite (file): keep suites from fighting over Docker resources locally.
    fileParallelism: false,
  },
});
