// T6 (spec.md §5 AC-08, AC-09; §6 Tenant isolation) — every id-taking customer function answers
// for Freelancer B's record exactly as for an id that never existed, and leaves B's row untouched.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createCustomer as seedCustomer } from '../../../support/factories/customer';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Result = { success: boolean; code?: string; error?: string };
type Service = {
  getCustomer: (a: unknown, id: string) => Promise<Result>;
  updateCustomer: (a: unknown, id: string, input: unknown) => Promise<Result>;
  deleteCustomer: (a: unknown, id: string) => Promise<Result>;
};

describe.runIf(containerRuntimeAvailable)('customers foreign-record isolation (T6)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Service;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/customers/customers')) as unknown as Service;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seed() {
    const a = await createFreelancer(prisma, { email: 't6-a@example.com' });
    const b = await createFreelancer(prisma, { email: 't6-b@example.com' });
    const bCustomer = await seedCustomer(prisma, b.id, { name: 'B customer' });
    return { actorA: await actingFreelancerForTest(a.id), bCustomer };
  }

  const input = { name: 'Hijacked', defaultCurrency: 'EUR' };

  it("AC-08/AC-09: getCustomer with B's id is NOT_FOUND, same as a nonexistent id", async () => {
    const { actorA, bCustomer } = await seed();
    const foreign = await svc.getCustomer(actorA, bCustomer.id);
    const missing = await svc.getCustomer(actorA, 'never-existed');
    expect(foreign).toEqual(missing);
    expect(foreign).toMatchObject({ success: false, code: 'NOT_FOUND', error: 'Customer not found.' });
  });

  it("AC-08/AC-09: updateCustomer with B's id is NOT_FOUND and B's row is byte-identical", async () => {
    const { actorA, bCustomer } = await seed();
    const foreign = await svc.updateCustomer(actorA, bCustomer.id, input);
    const missing = await svc.updateCustomer(actorA, 'never-existed', input);
    expect(foreign).toEqual(missing);
    expect(foreign).toMatchObject({ success: false, code: 'NOT_FOUND', error: 'Customer not found.' });
    expect(await prisma.customer.findUnique({ where: { id: bCustomer.id } })).toEqual(bCustomer);
  });

  it("AC-08/AC-09: deleteCustomer with B's id is NOT_FOUND and B's row is byte-identical", async () => {
    const { actorA, bCustomer } = await seed();
    const foreign = await svc.deleteCustomer(actorA, bCustomer.id);
    const missing = await svc.deleteCustomer(actorA, 'never-existed');
    expect(foreign).toEqual(missing);
    expect(foreign).toMatchObject({ success: false, code: 'NOT_FOUND', error: 'Customer not found.' });
    expect(await prisma.customer.findUnique({ where: { id: bCustomer.id } })).toEqual(bCustomer);
  });
});

describe.runIf(!containerRuntimeAvailable)('customers foreign-record isolation (T6)', () => {
  it.skip('skipped: no container runtime', () => {});
});
