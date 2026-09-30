# Test harness

Built in T00 (`docs/features/architecture-hardening/tasks/t00-test-harness.md`). Every later
architecture-hardening task writes its tests here, red-first.

## Layout

```
tests/
  unit/          Pure logic, no DOM, no database. Vitest, node environment.
  component/     React component tests. Vitest + @testing-library/react, jsdom
                 (`// @vitest-environment jsdom` docblock, or the tests/component/** glob).
  contract/      Validates a response body/status against contracts/openapi.yaml by
                 operationId. Vitest, node environment, no database.
  integration/   Talks to a real, throwaway Postgres container via Prisma. Vitest, separate
                 config (vitest.integration.config.ts) so it never shares a run with the DB-less
                 suites above.
  e2e/           Browser/HTTP tests. Playwright.
  support/       Everything reusable: factories, DB harness, clock, DNS resolver seam, image
                 host, contract helper. Not a test suite itself - nothing here matches a
                 `*.test.ts`/`*.spec.ts` glob.
```

## Commands

| Command                | Runs                                             | Needs Docker? |
|-------------------------|--------------------------------------------------|---------------|
| `pnpm test` / `test:unit` | `tests/unit`, `tests/component`, `tests/contract` | no |
| `pnpm test:integration` | `tests/integration`                               | yes (skips cleanly if absent) |
| `pnpm test:e2e`         | `tests/e2e`                                       | only for DB-backed e2e tests |

`pnpm lint` and `pnpm exec tsc --noEmit` cover `tests/**` too - they're plain project files, not
excluded from either.

## Writing an integration test

Integration tests get a throwaway Postgres container per file (test-plan.md §Test data: "a new
container per suite"), never the database in the repo's `.env` (see
`tests/support/db/env-guard.ts` - every path that touches a real connection string calls
`assertNotEnvDatabase` first).

```ts
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

describe.runIf(containerRuntimeAvailable)('my feature', () => {
  let db: TestDatabase;
  let prisma: ReturnType<typeof createTestPrismaClient>;

  beforeAll(async () => {
    db = await startTestDatabase(); // starts the container, runs `prisma migrate deploy`
    prisma = createTestPrismaClient(db.connectionString);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await db.stop();
  });

  beforeEach(() => truncateAllTables(prisma)); // not a wrapping transaction - see below

  it('does the thing', async () => {
    // use tests/support/factories/* to seed rows
  });
});
```

Cleanup is per-test truncation, not a wrapping transaction: the concurrency (AC-07) and deletion
(AC-22) tests need committed data visible on separate connections, which a transaction rollback
would hide.

If Docker doesn't answer (`docker version` hangs or errors), `isContainerRuntimeAvailable()`
resolves `false` within ~4s and the suite should skip via `describe.runIf(...)` - never fall back
to a different database. The same pattern applies to any e2e test that needs a database; see
`tests/e2e/support/require-container-runtime.ts`.

### Getting app code onto the container database

`prisma.ts` at the repo root builds its `PrismaClient` from `process.env.DATABASE_URL` at
module-load time and caches it on `globalThis` - there's no injection point today. Two ways to
reach it from a test, depending on what's under test (see the comment atop
`tests/support/db/client.ts` for the full rationale):

1. **Same-process app code** (server actions, route handlers imported directly into a Vitest
   test): set `process.env.DATABASE_URL` to the container's connection string, call
   `vi.resetModules()` if `@/prisma` was already imported earlier in the file, then
   `await import('@/prisma')`.
2. **A real server process** (Playwright `webServer`, or any spawned `next start`): pass the
   container's connection string as that process's `DATABASE_URL` env var (e.g.
   `webServer.env` in `playwright.config.ts`). The server's own `prisma.ts` loads it normally on
   first import inside that process.

Never import `@/prisma` directly from a test to talk to the container - always go through
`createTestPrismaClient`, so the env-guard runs before any query.

## Factories

`tests/support/factories/`: `createFreelancer` (+ `createSessionCookie` /
`tests/support/session-cookie.ts` for an auth cookie), `createSenderProfile` (unique
`invoicePrefix`), `createBankAccount`, `createCustomer`, `createProduct`, `createCustomPrice`,
`createInvoice` (+ items), `createLegacyInvoice` (NULL `invoiceNumberKey` once that column
exists, a stored total that disagrees with a fresh recompute). `createLogoFetchWindow` is a
stub that throws until T01 adds the `LogoFetchWindow` model - see the TODO in
`tests/support/factories/logo-fetch-window.ts`.

Every factory takes a `PrismaClient` (usually the one `createTestPrismaClient` returns) plus
overrides; fixture emails use `@example.test`.

## Utilities

- `tests/support/clock.ts` - injectable clock (`createFixedClock`), for rate-limit-window and
  `paidAt` tests.
- `tests/support/dns-resolver.ts` - the `DnsResolver` seam type the safe fetcher (T03) will
  accept, plus `createFakeDnsResolver` for SSRF tests.
- `tests/support/image-host.ts` - a local HTTP host with the fixtures test-plan.md lists: a
  small valid image, a 5 MB image, a false Content-Length, an HTML page, a slow-drip endpoint,
  and redirect chains (private address, https->http downgrade, 4 hops, dropped mid-body).
- `tests/support/contract/validate.ts` - `assertMatchesContract({ operationId, status, body })`
  against `contracts/openapi.yaml`.

## CI placement

Per `test-plan.md` §CI placement: unit, component, contract and integration run on every PR
(`.github/workflows/test.yml`). e2e, e2e-through-UI and the rate-limit load scenario are meant
to run before each wave ships and nightly, against a production build - not wired into this
minimal CI config yet; add them alongside the first task that needs a real e2e-through-UI run
against the app.
