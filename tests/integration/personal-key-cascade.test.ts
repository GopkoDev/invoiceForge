// T01 (AC-26 schema half): deleting a Freelancer cascades PersonalKey, PersonalKeyUsageWeek and
// MCP_KEY limit rows; MCP_SOURCE rows (no userId) survive. Also covers the new User columns.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createLimitEvent } from '../support/factories/limit-event';
import { createPersonalKeyUsageWeek } from '../support/factories/personal-key-usage-week';
import type { PrismaClient } from '@prisma/client';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

describe.runIf(containerRuntimeAvailable)(
  'PersonalKey schema and account-deletion cascade (T01, AC-26)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;

    beforeAll(async () => {
      db = await startTestDatabase();
      prisma = createTestPrismaClient(db.connectionString);
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    beforeEach(async () => {
      await truncateAllTables(prisma);
    });

    const insertKey = (userId: string, n: number) =>
      prisma.personalKey.create({
        data: {
          userId,
          name: `Test key ${n}`,
          activeNameKey: `test key ${n}`,
          digest: `fixture-digest-${userId}-${n}`,
          lastFour: '0000',
        },
      });

    it('stores timeZone and overdueNoticeDismissedAt, NULL by default', async () => {
      const plain = await createFreelancer(prisma);
      expect(plain.timeZone).toBeNull();
      expect(plain.overdueNoticeDismissedAt).toBeNull();
      const at = new Date('2026-10-01T10:00:00Z');
      const kyiv = await createFreelancer(prisma, {
        timeZone: 'Europe/Kyiv',
        overdueNoticeDismissedAt: at,
      });
      expect(kyiv.timeZone).toBe('Europe/Kyiv');
      expect(kyiv.overdueNoticeDismissedAt).toEqual(at);
    });

    it('accepts the MCP_KEY and MCP_SOURCE limit scopes', async () => {
      await createLimitEvent(prisma, { scope: 'MCP_KEY', key: 'k' });
      await createLimitEvent(prisma, { scope: 'MCP_SOURCE', key: 's' });
      expect(await prisma.limitEvent.count()).toBe(2);
    });

    it('enforces active-name uniqueness per Freelancer', async () => {
      const user = await createFreelancer(prisma);
      await insertKey(user.id, 1);
      await expect(
        prisma.personalKey.create({
          data: {
            userId: user.id,
            name: 'Test KEY 1',
            activeNameKey: 'test key 1',
            digest: 'other-digest',
            lastFour: '1111',
          },
        })
      ).rejects.toThrow();
    });

    it('prisma.user.delete removes keys, usage weeks and MCP_KEY rows', async () => {
      const user = await createFreelancer(prisma);
      const other = await createFreelancer(prisma);
      const key = await insertKey(user.id, 1);
      const otherKey = await insertKey(other.id, 1);
      await createPersonalKeyUsageWeek(prisma, { personalKeyId: key.id });
      await createPersonalKeyUsageWeek(prisma, { personalKeyId: otherKey.id });
      await createLimitEvent(prisma, {
        scope: 'MCP_KEY',
        key: key.id,
        userId: user.id,
      });
      await createLimitEvent(prisma, { scope: 'MCP_SOURCE', key: 'src' });

      await prisma.user.delete({ where: { id: user.id } });

      expect(
        await prisma.personalKey.count({ where: { userId: user.id } })
      ).toBe(0);
      expect(
        await prisma.personalKeyUsageWeek.count({
          where: { personalKeyId: key.id },
        })
      ).toBe(0);
      expect(
        await prisma.limitEvent.count({ where: { scope: 'MCP_KEY' } })
      ).toBe(0);
      // untouched rows
      expect(
        await prisma.personalKey.count({ where: { userId: other.id } })
      ).toBe(1);
      expect(await prisma.personalKeyUsageWeek.count()).toBe(1);
      expect(
        await prisma.limitEvent.count({ where: { scope: 'MCP_SOURCE' } })
      ).toBe(1);
    });

    it('createPersonalKeyUsageWeek defaults to Monday 00:00 UTC and zero counts', async () => {
      const user = await createFreelancer(prisma);
      const key = await insertKey(user.id, 1);
      const row = await createPersonalKeyUsageWeek(prisma, {
        personalKeyId: key.id,
      });
      expect(row.weekStart.getUTCDay()).toBe(1);
      expect(row.weekStart.getUTCHours()).toBe(0);
      expect([row.attempts, row.successes, row.assistantErrors]).toEqual([
        0, 0, 0,
      ]);
    });
  }
);
