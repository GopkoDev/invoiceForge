// T11 (spec.md §5 AC-05, AC-06, AC-07, AC-26; data-model.md §PersonalKey access patterns):
// key check, throttled last use and weekly usage counts against a throwaway Postgres.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createPersonalKey as seedKey } from '../../../support/factories/personal-key';
import { generatePersonalKey } from '@/lib/services/personal-keys/key-format';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type AuthResult =
  | { ok: true; actor: { userId: string; timeZone: string }; keyId: string }
  | { ok: false; unavailable?: true };
type Outcome = 'success' | 'assistant_error' | 'server_failure';
type Auth = { authenticatePersonalKey: (k: string, now: Date) => Promise<AuthResult> };
type Usage = { recordPersonalKeyUsage: (id: string, o: Outcome, now: Date) => Promise<void> };

describe.runIf(containerRuntimeAvailable)('personal key authentication and usage (T11)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let auth: Auth;
  let usage: Usage;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    auth = (await import('@/lib/services/personal-keys/authenticate')) as unknown as Auth;
    usage = (await import('@/lib/services/personal-keys/usage')) as unknown as Usage;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  const t0 = new Date('2026-03-04T10:00:00.000Z'); // a Wednesday
  const lastUsed = (id: string) =>
    prisma.personalKey.findUniqueOrThrow({ where: { id } }).then((k) => k.lastUsedAt);

  it('AC-07: a malformed key or bad checksum is refused', async () => {
    const { fullKey } = generatePersonalKey();
    const badChecksum = fullKey.slice(0, -1) + (fullKey.endsWith('a') ? 'b' : 'a');
    for (const k of ['', 'nope', badChecksum, 42 as unknown as string]) {
      expect(await auth.authenticatePersonalKey(k, t0)).toEqual({ ok: false });
    }
  });

  it('AC-07: unknown and revoked keys give the identical refusal', async () => {
    const user = await createFreelancer(prisma);
    const { fullKey: revoked } = await seedKey(prisma, user.id, { revoked: true });
    const unknown = generatePersonalKey().fullKey;
    const a = await auth.authenticatePersonalKey(revoked, t0);
    const b = await auth.authenticatePersonalKey(unknown, t0);
    expect(a).toEqual({ ok: false });
    expect(b).toEqual(a);
    expect(Object.keys(a)).toEqual(['ok']);
  });

  it('a valid key yields the actor with the account zone', async () => {
    const user = await createFreelancer(prisma);
    await prisma.user.update({ where: { id: user.id }, data: { timeZone: 'Europe/Kyiv' } });
    const { row, fullKey } = await seedKey(prisma, user.id);
    const r = await auth.authenticatePersonalKey(fullKey, t0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.actor).toMatchObject({ userId: user.id, timeZone: 'Europe/Kyiv' });
    expect(r.keyId).toBe(row.id);
  });

  it('a NULL account zone is UTC', async () => {
    const user = await createFreelancer(prisma);
    await prisma.user.update({ where: { id: user.id }, data: { timeZone: null } });
    const { fullKey } = await seedKey(prisma, user.id, { firstSuccessAt: t0 });
    const r = await auth.authenticatePersonalKey(fullKey, t0);
    expect(r.ok && r.actor.timeZone).toBe('UTC');
  });

  it('AC-06: a key revoked after a successful check is refused on the very next check', async () => {
    const user = await createFreelancer(prisma);
    const { row, fullKey } = await seedKey(prisma, user.id);
    expect((await auth.authenticatePersonalKey(fullKey, t0)).ok).toBe(true);
    await prisma.personalKey.update({ where: { id: row.id }, data: { revokedAt: t0, activeNameKey: null } });
    expect(await auth.authenticatePersonalKey(fullKey, t0)).toEqual({ ok: false });
  });

  it('AC-26: deleting the account makes its keys refuse like unknown ones', async () => {
    const user = await createFreelancer(prisma);
    const { fullKey } = await seedKey(prisma, user.id);
    await prisma.user.delete({ where: { id: user.id } });
    expect(await auth.authenticatePersonalKey(fullKey, t0)).toEqual({ ok: false });
  });

  it('AC-05: lastUsedAt is written at most once a minute', async () => {
    const user = await createFreelancer(prisma);
    const { row, fullKey } = await seedKey(prisma, user.id);
    await auth.authenticatePersonalKey(fullKey, t0);
    expect(await lastUsed(row.id)).toEqual(t0);
    await auth.authenticatePersonalKey(fullKey, new Date(t0.getTime() + 30_000));
    expect(await lastUsed(row.id)).toEqual(t0);
    const later = new Date(t0.getTime() + 60_000);
    await auth.authenticatePersonalKey(fullKey, later);
    expect(await lastUsed(row.id)).toEqual(later);
  });

  it('AC-07: a store failure is unavailable, distinct from a refusal', async () => {
    const user = await createFreelancer(prisma);
    const { fullKey } = await seedKey(prisma, user.id);
    const { prisma: appPrisma } = (await import('@/prisma')) as { prisma: PrismaClient };
    const spy = vi.spyOn(appPrisma, '$queryRaw').mockRejectedValue(new Error('connection reset'));
    try {
      expect(await auth.authenticatePersonalKey(fullKey, t0)).toEqual({ ok: false, unavailable: true });
    } finally {
      spy.mockRestore();
    }
  });

  it('AC-05: a failed lastUsedAt write does not refuse a valid key', async () => {
    const user = await createFreelancer(prisma);
    const { row, fullKey } = await seedKey(prisma, user.id);
    const { prisma: appPrisma } = (await import('@/prisma')) as { prisma: PrismaClient };
    const spy = vi.spyOn(appPrisma, '$executeRaw').mockRejectedValue(new Error('write failed'));
    try {
      const r = await auth.authenticatePersonalKey(fullKey, t0);
      expect(r.ok).toBe(true);
      expect(r.ok && r.keyId).toBe(row.id);
    } finally {
      spy.mockRestore();
    }
  });

  it('usage: weekStart is Monday 00:00 UTC and outcomes count correctly', async () => {
    const user = await createFreelancer(prisma);
    const { row } = await seedKey(prisma, user.id);
    await usage.recordPersonalKeyUsage(row.id, 'success', t0);
    await usage.recordPersonalKeyUsage(row.id, 'assistant_error', t0);
    await usage.recordPersonalKeyUsage(row.id, 'server_failure', t0);
    const weeks = await prisma.personalKeyUsageWeek.findMany({ where: { personalKeyId: row.id } });
    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekStart).toEqual(new Date('2026-03-02T00:00:00.000Z'));
    expect(weeks[0]).toMatchObject({ attempts: 3, successes: 1, assistantErrors: 1 });
    // Sunday 23:59 UTC is still the same week; Monday 00:00 starts the next one.
    await usage.recordPersonalKeyUsage(row.id, 'success', new Date('2026-03-08T23:59:59.999Z'));
    expect(await prisma.personalKeyUsageWeek.count({ where: { personalKeyId: row.id } })).toBe(1);
    await usage.recordPersonalKeyUsage(row.id, 'success', new Date('2026-03-09T00:00:00.000Z'));
    expect(await prisma.personalKeyUsageWeek.count({ where: { personalKeyId: row.id } })).toBe(2);
  });

  it('usage: two racing first calls of a week give one row with attempts = 2', async () => {
    const user = await createFreelancer(prisma);
    const { row } = await seedKey(prisma, user.id);
    await Promise.all([
      usage.recordPersonalKeyUsage(row.id, 'success', t0),
      usage.recordPersonalKeyUsage(row.id, 'success', t0),
    ]);
    const weeks = await prisma.personalKeyUsageWeek.findMany({ where: { personalKeyId: row.id } });
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({ attempts: 2, successes: 2 });
  });

  it('usage: firstSuccessAt is set on the first success only', async () => {
    const user = await createFreelancer(prisma);
    const { row } = await seedKey(prisma, user.id);
    await usage.recordPersonalKeyUsage(row.id, 'assistant_error', t0);
    expect((await prisma.personalKey.findUniqueOrThrow({ where: { id: row.id } })).firstSuccessAt).toBeNull();
    await usage.recordPersonalKeyUsage(row.id, 'success', t0);
    await usage.recordPersonalKeyUsage(row.id, 'success', new Date(t0.getTime() + 3600_000));
    expect((await prisma.personalKey.findUniqueOrThrow({ where: { id: row.id } })).firstSuccessAt).toEqual(t0);
  });
});
