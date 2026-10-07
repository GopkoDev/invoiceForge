// T23 (spec.md §5 AC-26; data-model.md §Account deletion) — deleting the account removes every
// Personal key, its usage weeks and the MCP_KEY limit rows in the one existing transaction, and
// leaves MCP_SOURCE rows (which belong to no account) alone.
import { createHash } from 'node:crypto';
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
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createPersonalKeyUsageWeek } from '../../../support/factories/personal-key-usage-week';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

describe.runIf(containerRuntimeAvailable)(
  'deleteAccount removes Personal keys (T23, AC-26)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let account: typeof import('@/lib/services/account/account');

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      account = await import('@/lib/services/account/account');
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    afterEach(async () => {
      await truncateAllTables(prisma);
    });

    const digestOf = (v: string) =>
      createHash('sha256').update(v).digest('hex');

    it('AC-26: no key, usage week or MCP_KEY row remains; the other account and MCP_SOURCE rows are untouched', async () => {
      const owner = await createFreelancer(prisma);
      const other = await createFreelancer(prisma);
      const ownerKeys = [];
      for (const n of ['one', 'two']) {
        ownerKeys.push(
          await prisma.personalKey.create({
            data: {
              userId: owner.id,
              name: n,
              activeNameKey: n,
              digest: digestOf(`owner-${n}`),
              lastFour: 'abcd',
            },
          })
        );
      }
      const otherKey = await prisma.personalKey.create({
        data: {
          userId: other.id,
          name: 'keep',
          activeNameKey: 'keep',
          digest: digestOf('other'),
          lastFour: 'wxyz',
        },
      });
      for (const k of [...ownerKeys, otherKey]) {
        await createPersonalKeyUsageWeek(prisma, {
          personalKeyId: k.id,
          attempts: 1,
        });
      }
      await prisma.limitEvent.create({
        data: {
          scope: 'MCP_KEY',
          key: digestOf('owner-one'),
          outcome: 'REQUESTED',
          userId: owner.id,
        },
      });
      await prisma.limitEvent.create({
        data: {
          scope: 'MCP_KEY',
          key: digestOf('other'),
          outcome: 'REQUESTED',
          userId: other.id,
        },
      });
      await prisma.limitEvent.create({
        data: {
          scope: 'MCP_SOURCE',
          key: digestOf('203.0.113.9'),
          outcome: 'REQUESTED',
        },
      });

      const result = await account.deleteAccount(
        await actingFreelancerForTest(owner.id)
      );

      expect(result.success).toBe(true);
      expect(await prisma.personalKey.findMany()).toEqual([
        expect.objectContaining({ id: otherKey.id }),
      ]);
      const weeks = await prisma.personalKeyUsageWeek.findMany();
      expect(weeks.map((w) => w.personalKeyId)).toEqual([otherKey.id]);
      expect(
        await prisma.limitEvent.count({
          where: { scope: 'MCP_KEY', userId: owner.id },
        })
      ).toBe(0);
      expect(
        await prisma.limitEvent.count({ where: { scope: 'MCP_KEY' } })
      ).toBe(1);
      expect(
        await prisma.limitEvent.count({ where: { scope: 'MCP_SOURCE' } })
      ).toBe(1);
      // The digest no longer resolves to any key (uniform refusal at the auth layer).
      expect(
        await prisma.personalKey.findUnique({
          where: { digest: digestOf('owner-one') },
        })
      ).toBeNull();
    });
  }
);

describe.runIf(!containerRuntimeAvailable)('deleteAccount keys (T23)', () => {
  it.skip('skipped: no container runtime', () => {});
});
