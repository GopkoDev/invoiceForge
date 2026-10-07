// MCP limit scopes (AC-11; ADR-0007): per-key call window and per-source refused-key-check window.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import {
  createLimitEvent,
  limitKeyDigest,
} from '../../../support/factories/limit-event';
import { createMcpLimits } from '@/lib/security/limits/mcp';
import { LIMIT_SCOPES } from '@/lib/security/limits/scopes';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const SEC = 1000;
const MIN = 60 * SEC;
const T0 = new Date('2026-10-04T12:00:00.000Z');
const ago = (ms: number) => new Date(T0.getTime() - ms);

describe('MCP scope config', () => {
  it('declares the per-key and per-source windows', () => {
    expect(LIMIT_SCOPES.MCP_KEY).toEqual({
      windowMs: 60_000,
      max: 60,
      countedOutcomes: ['REQUESTED'],
    });
    expect(LIMIT_SCOPES.MCP_SOURCE).toEqual({
      windowMs: 5 * MIN,
      max: 30,
      countedOutcomes: ['REFUSED'],
    });
  });
});

describe.runIf(containerRuntimeAvailable)('MCP limits (T10)', () => {
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
  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  const seedKeyCalls = async (
    keyId: string,
    userId: string,
    ats: Date[]
  ): Promise<void> => {
    for (const at of ats)
      await createLimitEvent(prisma, {
        scope: 'MCP_KEY',
        key: keyId,
        userId,
        outcome: 'REQUESTED',
        at,
      });
  };
  const count = (scope: 'MCP_KEY' | 'MCP_SOURCE', key: string) =>
    prisma.limitEvent.count({ where: { scope, key } });

  it('allows a call under the limit, records it with the owner userId', async () => {
    const user = await createFreelancer(prisma);
    const limits = createMcpLimits({ prisma });
    expect(await limits.takeMcpKeyCall('key-a', user.id, T0)).toEqual({
      allowed: true,
    });
    const rows = await prisma.limitEvent.findMany({
      where: { scope: 'MCP_KEY', key: 'key-a' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: user.id,
      outcome: 'REQUESTED',
      at: T0,
    });
  });

  it('refuses the 61st call with retryAt = oldest + 60 s and writes nothing', async () => {
    const user = await createFreelancer(prisma);
    const oldest = ago(59 * SEC);
    await seedKeyCalls(
      'key-a',
      user.id,
      Array.from({ length: 60 }, (_, i) => new Date(oldest.getTime() + i * 10))
    );
    const limits = createMcpLimits({ prisma });
    expect(await limits.takeMcpKeyCall('key-a', user.id, T0)).toEqual({
      allowed: false,
      retryAt: new Date(oldest.getTime() + MIN),
    });
    expect(await count('MCP_KEY', 'key-a')).toBe(60);
  });

  it('slides: once the oldest leaves the window the next call is allowed', async () => {
    const user = await createFreelancer(prisma);
    await seedKeyCalls('key-a', user.id, [
      ago(MIN), // exactly one window old: outside
      ...Array.from({ length: 59 }, (_, i) => ago(30 * SEC - i)),
    ]);
    const limits = createMcpLimits({ prisma });
    expect(await limits.takeMcpKeyCall('key-a', user.id, T0)).toEqual({
      allowed: true,
    });
  });

  it('isolates keys and users', async () => {
    const a = await createFreelancer(prisma);
    const b = await createFreelancer(prisma);
    await seedKeyCalls(
      'key-a',
      a.id,
      Array.from({ length: 60 }, () => ago(SEC))
    );
    const limits = createMcpLimits({ prisma });
    expect(await limits.takeMcpKeyCall('key-a', a.id, T0)).toMatchObject({
      allowed: false,
    });
    expect(await limits.takeMcpKeyCall('key-a2', a.id, T0)).toEqual({
      allowed: true,
    });
    expect(await limits.takeMcpKeyCall('key-b', b.id, T0)).toEqual({
      allowed: true,
    });
  });

  it('blocks a source after 30 refused key checks, retryAt = oldest + 5 min', async () => {
    const source = limitKeyDigest('198.51.100.9');
    const oldest = ago(4 * MIN);
    for (let i = 0; i < 30; i++)
      await createLimitEvent(prisma, {
        scope: 'MCP_SOURCE',
        key: source,
        outcome: 'REFUSED',
        at: new Date(oldest.getTime() + i),
      });
    const limits = createMcpLimits({ prisma });
    expect(await limits.checkMcpSource(source, T0)).toEqual({
      allowed: false,
      retryAt: new Date(oldest.getTime() + 5 * MIN),
    });
    expect(await limits.checkMcpSource(limitKeyDigest('other'), T0)).toEqual({
      allowed: true,
    });
  });

  it('recordRefusedKeyCheck writes REFUSED rows without userId; 29 still allowed, 30th blocks', async () => {
    const source = limitKeyDigest('198.51.100.10');
    const limits = createMcpLimits({ prisma });
    for (let i = 0; i < 29; i++) await limits.recordRefusedKeyCheck(source, T0);
    expect(await limits.checkMcpSource(source, T0)).toEqual({ allowed: true });
    await limits.recordRefusedKeyCheck(source, T0);
    expect(await limits.checkMcpSource(source, T0)).toMatchObject({
      allowed: false,
    });
    const row = await prisma.limitEvent.findFirstOrThrow({
      where: { scope: 'MCP_SOURCE', key: source },
    });
    expect(row).toMatchObject({ outcome: 'REFUSED', userId: null });
  });

  it('fails closed with an unavailable store, and recording never throws', async () => {
    const broken = createTestPrismaClient(
      'postgresql://u:p@127.0.0.1:1/none?connect_timeout=1'
    );
    try {
      const limits = createMcpLimits({ prisma: broken });
      expect(await limits.checkMcpSource('s', T0)).toEqual({
        unavailable: true,
      });
      expect(await limits.takeMcpKeyCall('k', 'u', T0)).toEqual({
        unavailable: true,
      });
      await expect(
        limits.recordRefusedKeyCheck('s', T0)
      ).resolves.toBeUndefined();
    } finally {
      await broken.$disconnect();
    }
  }, 30_000);
});
