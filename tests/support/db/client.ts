// A Prisma client bound to the throwaway container, for tests that talk to the database
// directly through factories/assertions.
//
// Seam for app code (documented, used by later tasks):
// `prisma.ts` at the repo root builds its `PrismaClient` from `process.env.DATABASE_URL` at
// module-load time and caches it on `globalThis`. There is no dependency-injection point today,
// so tests get app code onto the container database one of two ways, depending on what's under
// test:
//   1. Same-process code (server actions, route handlers imported directly in a Vitest test):
//      set `process.env.DATABASE_URL` to the container's connection string *before* importing
//      anything that transitively imports `@/prisma`, and call `vi.resetModules()` first if a
//      previous test in the same file already imported it. Import with a dynamic
//      `await import('@/prisma')` after the env var is set, per test file.
//   2. A real server process (e2e, via Playwright's `webServer`): pass the container's
//      connection string as `DATABASE_URL` in that process's environment (e.g.
//      `webServer.env` in playwright.config.ts). The server's own `prisma.ts` module then loads
//      it normally on first import, inside that process - no code change needed.
// Never import `@/prisma` from a test to talk to the container directly; use
// `createTestPrismaClient` below instead, so the env-guard runs before any query.

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertNotEnvDatabase } from './env-guard';

export function createTestPrismaClient(connectionString: string): PrismaClient {
  assertNotEnvDatabase(connectionString);
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
