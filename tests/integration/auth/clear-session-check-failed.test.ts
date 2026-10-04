// AC-04: a failed check never ends an existing session, so a database outage during the session
// lookup must not sign anyone out.
//
// Drives the real clear-session route handler, the real `requireSession()` and the real
// `sessionCallback` (the exact function auth.ts wires into NextAuth) against a real Postgres
// container whose "User" table is made unreachable, so Prisma really throws in the session lookup.
//
// '@/auth' is mocked to do what
// @auth/core's session action does with the jwt strategy: run the session callback for the
// decoded token, and resolve null when that callback throws (core logs JWTSessionError and
// returns no session, see @auth/core lib/actions/session.js). Everything downstream is production.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

// The account id inside the browser's (decodable) session token, set per test.
let tokenId: string | undefined;

vi.mock('@/auth', () => ({
  auth: async () => {
    const { sessionCallback } = await import('@/lib/helpers/session-callback');
    try {
      return await sessionCallback({
        session: {
          user: { name: 'Freelancer', email: 'freelancer@example.test' },
          expires: new Date(Date.now() + 60_000).toISOString(),
        },
        token: { id: tokenId },
      });
    } catch {
      return null;
    }
  },
}));

const SESSION_COOKIE = '__Secure-authjs.session-token=decodable-jwt';

function clearSessionRequest(): NextRequest {
  return new NextRequest('https://app.example.test/api/auth/clear-session', {
    headers: { cookie: SESSION_COOKIE },
  });
}

function sessionCookieExpiries(res: Response): string[] {
  return res.headers
    .getSetCookie()
    .filter((c) => /authjs\.session-token[^=]*=;/.test(c));
}

type Get = (req: NextRequest) => Promise<Response>;

describe.runIf(containerRuntimeAvailable)(
  'clear-session vs a failing session lookup — real DB (T21, AC-04, F-01)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let GET: Get;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      ({ GET } =
        (await import('@/app/api/auth/clear-session/route')) as unknown as {
          GET: Get;
        });
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    afterEach(async () => {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE IF EXISTS "User_t21_offline" RENAME TO "User"'
      );
      await truncateAllTables(prisma);
    });

    it('AC-04: Prisma throwing in the session lookup ends nothing (503, no cookie expiry), and the same cookie works once it recovers', async () => {
      const freelancer = await createFreelancer(prisma, {
        email: 'check-failed@example.test',
      });
      tokenId = freelancer.id;
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "User" RENAME TO "User_t21_offline"'
      );

      const failed = await GET(clearSessionRequest());

      expect(failed.status).toBe(503);
      expect(sessionCookieExpiries(failed)).toEqual([]);

      await prisma.$executeRawUnsafe(
        'ALTER TABLE "User_t21_offline" RENAME TO "User"'
      );
      const recovered = await GET(clearSessionRequest());

      expect(recovered.status).toBe(302);
      expect(
        new URL(recovered.headers.get('location') as string).pathname
      ).toBe('/dashboard');
      expect(sessionCookieExpiries(recovered)).toEqual([]);
    });

    it('contrast (AC-21): a token whose User row is really gone does get its cookies cleared', async () => {
      const freelancer = await createFreelancer(prisma, {
        email: 'account-gone@example.test',
      });
      tokenId = freelancer.id;
      await prisma.user.delete({ where: { id: freelancer.id } });

      const res = await GET(clearSessionRequest());

      expect(res.status).toBe(302);
      expect(new URL(res.headers.get('location') as string).pathname).toBe(
        '/login'
      );
      expect(sessionCookieExpiries(res)).not.toEqual([]);
    });
  }
);

describe.runIf(!containerRuntimeAvailable)(
  'clear-session vs a failing session lookup (T21)',
  () => {
    it.skip('skipped: no container runtime', () => {});
  }
);
