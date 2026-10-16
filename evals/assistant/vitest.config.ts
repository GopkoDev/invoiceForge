// Runner for `pnpm eval:assistant`: vitest resolves the `@/` alias, TypeScript and `server-only`
// exactly as the app's own suites do, so run.ts can import the real router and agent.
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    server: { deps: { inline: ['next-auth'] } },
    setupFiles: [
      'tests/support/server-only-mock.ts',
      'tests/support/limit-key-env.ts',
    ],
    include: ['evals/assistant/run.ts'],
    // A full run is ~110 model calls plus container start; retries with backoff can stretch it.
    testTimeout: 30 * 60_000,
    hookTimeout: 120_000,
  },
});
