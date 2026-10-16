// T09 (spec.md §5 AC-25, AC-26; ADR-0011; contracts/server-actions.md §Personal keys): Draft
// permission is set only when a Personal key is created, listed, and returned by the key check.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { createFreelancer } from '../../../support/factories/user';
import { createPersonalKey as seedKey } from '../../../support/factories/personal-key';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Result<T> = { success: true; data: T } | { success: false; code: string; error: string };
type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Summary = { id: string; name: string; canCreateDrafts: boolean };
type Service = {
  createPersonalKey: (
    a: Actor,
    input: { name: string; canCreateDrafts?: boolean },
  ) => Promise<Result<{ key: Summary; fullKey: string }>>;
  listPersonalKeys: (a: Actor) => Promise<Result<{ active: Summary[]; revoked: Summary[] }>>;
};
type AuthResult =
  | { ok: true; keyId: string; canCreateDrafts: boolean; name: string }
  | { ok: false };
type Auth = { authenticatePersonalKey: (k: string, now: Date) => Promise<AuthResult> };

const ROOT = path.resolve(__dirname, '../../../..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('AC-26: no code path updates canCreateDrafts', () => {
  it('no personalKey update or raw UPDATE in lib/ or app/ writes canCreateDrafts', () => {
    const offenders: string[] = [];
    for (const dir of ['lib', 'app']) {
      for (const file of sourceFiles(path.join(ROOT, dir))) {
        const text = readFileSync(file, 'utf8');
        const updateCall = /personalKey\s*\.\s*(update|updateMany|upsert)\s*\(([\s\S]*?)\)\s*;?\s*(?:\n\s*\n|$)/g;
        for (const m of text.matchAll(updateCall)) {
          if (m[2].includes('canCreateDrafts')) offenders.push(file);
        }
        const rawUpdate = /UPDATE\s+"PersonalKey"\s+SET[\s\S]*?(?:`|;)/gi;
        for (const m of text.matchAll(rawUpdate)) {
          if (m[0].includes('canCreateDrafts')) offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe.runIf(containerRuntimeAvailable)('personal key Draft permission (T09)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Service;
  let auth: Auth;
  let appPrisma: PrismaClient;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/personal-keys/personal-keys')) as unknown as Service;
    auth = (await import('@/lib/services/personal-keys/authenticate')) as unknown as Auth;
    appPrisma = (await import('@/prisma')).prisma as unknown as PrismaClient;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await truncateAllTables(prisma);
  });

  async function setup() {
    const user = await createFreelancer(prisma);
    return { user, actor: await actingFreelancerForTest(user.id) };
  }

  it('AC-25: a key created with Draft permission is stored and marked in the list', async () => {
    const { actor } = await setup();
    const r = await svc.createPersonalKey(actor, { name: 'Drafter', canCreateDrafts: true });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.fullKey).toMatch(/^ifk_/);
    expect(r.data.key.canCreateDrafts).toBe(true);
    const row = await prisma.personalKey.findUniqueOrThrow({ where: { id: r.data.key.id } });
    expect(row.canCreateDrafts).toBe(true);
    const list = await svc.listPersonalKeys(actor);
    expect(list.success && list.data.active.map((k) => [k.name, k.canCreateDrafts])).toEqual([['Drafter', true]]);
  });

  it('AC-26: create without the field, or with false, stores false', async () => {
    const { actor } = await setup();
    const a = await svc.createPersonalKey(actor, { name: 'Default' });
    const b = await svc.createPersonalKey(actor, { name: 'Explicit', canCreateDrafts: false });
    expect(a.success && a.data.key.canCreateDrafts).toBe(false);
    expect(b.success && b.data.key.canCreateDrafts).toBe(false);
    const rows = await prisma.personalKey.findMany({ select: { canCreateDrafts: true } });
    expect(rows.map((r) => r.canCreateDrafts)).toEqual([false, false]);
  });

  it('the list returns canCreateDrafts for active and revoked keys, pre-release keys false', async () => {
    const { user, actor } = await setup();
    await seedKey(prisma, user.id, { name: 'Old' });
    await seedKey(prisma, user.id, { name: 'Gone', canCreateDrafts: true, revoked: true });
    await seedKey(prisma, user.id, { name: 'Live', canCreateDrafts: true });
    const list = await svc.listPersonalKeys(actor);
    expect(list.success).toBe(true);
    if (!list.success) return;
    expect(Object.fromEntries(list.data.active.map((k) => [k.name, k.canCreateDrafts]))).toEqual({
      Old: false,
      Live: true,
    });
    expect(list.data.revoked.map((k) => [k.name, k.canCreateDrafts])).toEqual([['Gone', true]]);
  });

  it('the key check returns canCreateDrafts and name from the same row with no extra query', async () => {
    const { user } = await setup();
    const { row, fullKey } = await seedKey(prisma, user.id, { name: 'Checker', canCreateDrafts: true });
    const { fullKey: plainKey } = await seedKey(prisma, user.id, { name: 'Plain' });
    const queryRaw = vi.spyOn(appPrisma, '$queryRaw');
    const findFirst = vi.spyOn(appPrisma.personalKey, 'findFirst');
    const findUnique = vi.spyOn(appPrisma.personalKey, 'findUnique');
    const findMany = vi.spyOn(appPrisma.personalKey, 'findMany');

    const r = await auth.authenticatePersonalKey(fullKey, new Date());
    expect(r).toMatchObject({ ok: true, keyId: row.id, canCreateDrafts: true, name: 'Checker' });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(findFirst).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();

    const plain = await auth.authenticatePersonalKey(plainKey, new Date());
    expect(plain).toMatchObject({ ok: true, canCreateDrafts: false, name: 'Plain' });
  });
});
