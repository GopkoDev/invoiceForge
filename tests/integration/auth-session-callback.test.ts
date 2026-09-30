// T34 (spec.md §5 AC-21, ADR-0002) — Review 2026-09-27 F-11, first bullet: no test drove the
// real `auth.ts` session callback for a deleted user; every AC-21 test up to now mocked `auth()`
// itself (tests/unit/lib/helpers/route-auth.test.ts), so a regression inside the callback's own
// live-account lookup (auth.ts:73-98) would never fail a test.
//
// This suite imports auth.ts's own extracted `sessionCallback` (lib/helpers/session-callback.ts,
// production code, not a test double — auth.ts wires it into NextAuth's `callbacks.session`
// unchanged) and drives it directly against a real Postgres container: a token whose `id` names
// a User row that no longer exists must come back with no `session.user.id` set, exactly like
// the unit-level `requireLiveUser` test models it (route-auth.test.ts: "session with no live
// user id"). A token for a live user is exercised too, so the refusal path is contrasted against
// the callback's normal behaviour, not just asserted in isolation.
//
// Seam: `sessionCallback` deliberately does not import 'next-auth' itself (that package pulls in
// Next.js's own request machinery via 'next/server', which cannot be imported outside a served
// app — see the module's own comment), so this is a same-process import of plain app code
// (tests/README.md option 1): DATABASE_URL set before the import, real container database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { createFreelancer } from '../support/factories/user';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type MinimalSession = { user?: { id?: string; name?: string | null; email?: string | null; image?: string | null }; expires: string };
type MinimalToken = { id?: unknown };
type SessionCallback = (params: { session: MinimalSession; token: MinimalToken }) => Promise<MinimalSession>;

describe.runIf(containerRuntimeAvailable)('sessionCallback — real DB, deleted user (T34, AC-21, F-11)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let sessionCallback: SessionCallback;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    prisma = createTestPrismaClient(db.connectionString);
    ({ sessionCallback } = (await import('@/lib/helpers/session-callback')) as unknown as {
      sessionCallback: SessionCallback;
    });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it('AC-21: a token id whose User row is gone comes back with no session.user.id', async () => {
    const session: MinimalSession = { user: {}, expires: new Date(Date.now() + 60_000).toISOString() };

    const result = await sessionCallback({ session, token: { id: 'deleted-account-0000000002' } });

    expect(result.user?.id).toBeUndefined();
  });

  it('contrast: a token id for a live user is populated onto the session for real', async () => {
    const freelancer = await createFreelancer(prisma, { email: 'session-callback-live@example.test' });
    const session: MinimalSession = { user: {}, expires: new Date(Date.now() + 60_000).toISOString() };

    const result = await sessionCallback({ session, token: { id: freelancer.id } });

    expect(result.user?.id).toBe(freelancer.id);
    expect(result.user?.email).toBe(freelancer.email);
  });

  it('a token with no id at all leaves the session untouched', async () => {
    const session: MinimalSession = { user: {}, expires: new Date(Date.now() + 60_000).toISOString() };

    const result = await sessionCallback({ session, token: {} });

    expect(result.user?.id).toBeUndefined();
  });
});

describe.runIf(!containerRuntimeAvailable)('auth.ts sessionCallback (T34)', () => {
  it.skip('skipped: no container runtime', () => {});
});
