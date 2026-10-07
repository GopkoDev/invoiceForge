// T09 (spec.md §5 AC-01 to AC-06; contracts/server-actions.md §Personal keys): create, list and
// revoke Personal keys, plus the "has any key been used" read, against a throwaway Postgres.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { createFreelancer } from '../../../support/factories/user';
import { createPersonalKey as seedKey } from '../../../support/factories/personal-key';
import { digestKey, isWellFormedKey } from '@/lib/services/personal-keys/key-format';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Result<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string; fieldErrors?: Record<string, string[]>; details?: unknown };
type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Summary = { id: string; name: string; createdAt: string; lastFour: string; lastUsedAt: string | null };
type Revoked = Summary & { revokedAt: string };
type Service = {
  createPersonalKey: (a: Actor, input: { name: string }) => Promise<Result<{ key: Summary; fullKey: string }>>;
  revokePersonalKey: (a: Actor, id: string) => Promise<Result<void>>;
  listPersonalKeys: (a: Actor) => Promise<Result<{ active: Summary[]; revoked: Revoked[] }>>;
  hasUsedAnyPersonalKey: (a: Actor) => Promise<Result<boolean>>;
};

const KEY_NAME_MESSAGE = 'The name must be 1 to 50 characters and different from your other active keys.';
const KEY_LIMIT_MESSAGE = 'At most 10 keys can be active at once. Revoke one to make room.';

describe.runIf(containerRuntimeAvailable)('personal key management (T09)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Service;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/personal-keys/personal-keys')) as unknown as Service;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function setup() {
    const user = await createFreelancer(prisma);
    return { user, actor: await actingFreelancerForTest(user.id) };
  }

  it('AC-02: create returns the full key once, stores only its digest, and trims the name', async () => {
    const { user, actor } = await setup();
    const r = await svc.createPersonalKey(actor, { name: '  Laptop assistant  ' });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(isWellFormedKey(r.data.fullKey)).toBe(true);
    expect(r.data.key).toMatchObject({ name: 'Laptop assistant', lastFour: r.data.fullKey.slice(-4), lastUsedAt: null });
    expect(Object.keys(r.data.key).sort()).toEqual(['createdAt', 'id', 'lastFour', 'lastUsedAt', 'name']);
    const row = await prisma.personalKey.findUniqueOrThrow({ where: { id: r.data.key.id } });
    expect(row).toMatchObject({
      userId: user.id,
      name: 'Laptop assistant',
      activeNameKey: 'laptop assistant',
      digest: digestKey(r.data.fullKey),
    });
    expect(JSON.stringify(row)).not.toContain(r.data.fullKey);
  });

  it.each([
    ['empty', ''],
    ['spaces only', '   '],
    ['over 50 characters', 'x'.repeat(51)],
  ])('AC-03: refuses a name that is %s', async (_l, name) => {
    const { actor } = await setup();
    const r = await svc.createPersonalKey(actor, { name });
    expect(r).toMatchObject({ success: false, code: 'VALIDATION', error: KEY_NAME_MESSAGE });
    if (!r.success) expect(r.fieldErrors).toEqual({ name: [KEY_NAME_MESSAGE] });
    expect(await prisma.personalKey.count()).toBe(0);
  });

  it('AC-03: accepts exactly 50 characters', async () => {
    const { actor } = await setup();
    expect((await svc.createPersonalKey(actor, { name: 'x'.repeat(50) })).success).toBe(true);
  });

  it('AC-03: a name equal to an active key ignoring case and outer spaces is refused', async () => {
    const { user, actor } = await setup();
    await seedKey(prisma, user.id, { name: 'Laptop' });
    const r = await svc.createPersonalKey(actor, { name: '  LAPTOP ' });
    expect(r).toMatchObject({ success: false, code: 'VALIDATION', error: KEY_NAME_MESSAGE });
    if (!r.success) expect(r.fieldErrors).toEqual({ name: [KEY_NAME_MESSAGE] });
    expect(await prisma.personalKey.count()).toBe(1);
  });

  it('AC-03: another Freelancer may use the same name; a revoked key name may be reused', async () => {
    const { user, actor } = await setup();
    const other = await createFreelancer(prisma);
    await seedKey(prisma, other.id, { name: 'Laptop' });
    await seedKey(prisma, user.id, { name: 'Old', revoked: true });
    expect((await svc.createPersonalKey(actor, { name: 'Laptop' })).success).toBe(true);
    expect((await svc.createPersonalKey(actor, { name: 'old' })).success).toBe(true);
  });

  it('AC-03: parallel creates of the same name leave exactly one key, the others get the name refusal', async () => {
    const { actor } = await setup();
    const rs = await Promise.all([1, 2, 3].map(() => svc.createPersonalKey(actor, { name: 'Same' })));
    expect(rs.filter((r) => r.success)).toHaveLength(1);
    for (const r of rs.filter((x) => !x.success)) {
      expect(r).toMatchObject({ code: 'VALIDATION', error: KEY_NAME_MESSAGE });
    }
    expect(await prisma.personalKey.count()).toBe(1);
  });

  it('AC-04: the 11th active key is refused with CONFLICT', async () => {
    const { user, actor } = await setup();
    for (let i = 0; i < 10; i++) await seedKey(prisma, user.id, { name: `K${i}` });
    const r = await svc.createPersonalKey(actor, { name: 'Eleventh' });
    expect(r).toMatchObject({ success: false, code: 'CONFLICT', error: KEY_LIMIT_MESSAGE });
    expect(await prisma.personalKey.count()).toBe(10);
  });

  it('AC-04: revoked keys do not count toward the limit', async () => {
    const { user, actor } = await setup();
    for (let i = 0; i < 9; i++) await seedKey(prisma, user.id, { name: `K${i}` });
    await seedKey(prisma, user.id, { name: 'Gone', revoked: true });
    expect((await svc.createPersonalKey(actor, { name: 'Tenth' })).success).toBe(true);
  });

  it('AC-04: with a duplicate name and 10 active keys the name refusal wins', async () => {
    const { user, actor } = await setup();
    for (let i = 0; i < 10; i++) await seedKey(prisma, user.id, { name: `K${i}` });
    const r = await svc.createPersonalKey(actor, { name: 'k3' });
    expect(r).toMatchObject({ success: false, code: 'VALIDATION', error: KEY_NAME_MESSAGE });
  });

  it('AC-04: two parallel creates at 9 active keys give one success and one CONFLICT', async () => {
    const { user, actor } = await setup();
    for (let i = 0; i < 9; i++) await seedKey(prisma, user.id, { name: `K${i}` });
    const rs = await Promise.all([
      svc.createPersonalKey(actor, { name: 'A' }),
      svc.createPersonalKey(actor, { name: 'B' }),
    ]);
    expect(rs.filter((r) => r.success)).toHaveLength(1);
    expect(rs.find((r) => !r.success)).toMatchObject({ code: 'CONFLICT', error: KEY_LIMIT_MESSAGE });
    expect(await prisma.personalKey.count({ where: { revokedAt: null } })).toBe(10);
  });

  it('AC-05: list splits active and revoked, createdAt DESC, with last use and no secrets', async () => {
    const { user, actor } = await setup();
    const used = new Date('2026-10-01T10:00:00Z');
    const a = await seedKey(prisma, user.id, { name: 'A', createdAt: new Date('2026-09-01T00:00:00Z'), lastUsedAt: used });
    const b = await seedKey(prisma, user.id, { name: 'B', createdAt: new Date('2026-09-03T00:00:00Z') });
    const c = await seedKey(prisma, user.id, { name: 'C', createdAt: new Date('2026-09-02T00:00:00Z'), revoked: true });
    const d = await seedKey(prisma, user.id, { name: 'D', createdAt: new Date('2026-09-04T00:00:00Z'), revoked: true });
    const other = await createFreelancer(prisma);
    await seedKey(prisma, other.id, { name: 'Foreign' });
    const r = await svc.listPersonalKeys(actor);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.active.map((k) => k.id)).toEqual([b.row.id, a.row.id]);
    expect(r.data.revoked.map((k) => k.id)).toEqual([d.row.id, c.row.id]);
    expect(r.data.active[1]).toMatchObject({ lastUsedAt: used.toISOString(), lastFour: a.row.lastFour });
    expect(r.data.active[0].lastUsedAt).toBeNull();
    expect(r.data.revoked[0].revokedAt).toBe(d.row.revokedAt!.toISOString());
    const json = JSON.stringify(r.data);
    expect(json).not.toContain('digest');
    expect(json).not.toContain('activeNameKey');
    expect(json).not.toContain(a.row.digest);
  });

  it('AC-06: revoke marks the key revoked, clears activeNameKey and frees the name', async () => {
    const { user, actor } = await setup();
    const k = await seedKey(prisma, user.id, { name: 'Laptop' });
    expect((await svc.revokePersonalKey(actor, k.row.id)).success).toBe(true);
    const row = await prisma.personalKey.findUniqueOrThrow({ where: { id: k.row.id } });
    expect(row.revokedAt).toBeInstanceOf(Date);
    expect(row.activeNameKey).toBeNull();
    const list = await svc.listPersonalKeys(actor);
    expect(list.success && list.data.revoked.map((x) => x.id)).toEqual([k.row.id]);
    expect((await svc.createPersonalKey(actor, { name: 'Laptop' })).success).toBe(true);
  });

  it('AC-06: revokePersonalKey on a foreign Freelancer key, an already revoked or unknown key is NOT_FOUND and changes nothing', async () => {
    const { user, actor } = await setup();
    const other = await createFreelancer(prisma);
    const foreign = await seedKey(prisma, other.id, { name: 'F' });
    const gone = await seedKey(prisma, user.id, { name: 'G', revoked: true });
    const before = await prisma.personalKey.findUniqueOrThrow({ where: { id: gone.row.id } });
    for (const id of [foreign.row.id, gone.row.id, 'does-not-exist']) {
      expect(await svc.revokePersonalKey(actor, id)).toMatchObject({
        success: false,
        code: 'NOT_FOUND',
        error: 'Key not found.',
      });
    }
    expect((await prisma.personalKey.findUniqueOrThrow({ where: { id: foreign.row.id } })).revokedAt).toBeNull();
    expect((await prisma.personalKey.findUniqueOrThrow({ where: { id: gone.row.id } })).revokedAt).toEqual(
      before.revokedAt,
    );
  });

  it('AC-01: hasUsedAnyPersonalKey is false until a key is used, then stays true after every key is revoked', async () => {
    const { user, actor } = await setup();
    expect(await svc.hasUsedAnyPersonalKey(actor)).toEqual({ success: true, data: false });
    const k = await seedKey(prisma, user.id, { name: 'A' });
    expect(await svc.hasUsedAnyPersonalKey(actor)).toEqual({ success: true, data: false });
    await prisma.personalKey.update({ where: { id: k.row.id }, data: { lastUsedAt: new Date() } });
    expect(await svc.hasUsedAnyPersonalKey(actor)).toEqual({ success: true, data: true });
    await svc.revokePersonalKey(actor, k.row.id);
    expect(await svc.hasUsedAnyPersonalKey(actor)).toEqual({ success: true, data: true });
  });

  it("AC-01: another Freelancer's used key does not count", async () => {
    const { actor } = await setup();
    const other = await createFreelancer(prisma);
    await seedKey(prisma, other.id, { lastUsedAt: new Date() });
    expect(await svc.hasUsedAnyPersonalKey(actor)).toEqual({ success: true, data: false });
  });
});
