// T16 (spec.md §5 AC-21; contracts/server-actions.md §Web-address rule) — a bypassed form (direct
// service call) gets VALIDATION with field errors and nothing is saved. Real throwaway Postgres.
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
import { createCustomer as seedCustomer } from '../../../support/factories/customer';
import { createSenderProfile as seedSender } from '../../../support/factories/sender-profile';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const MSG = 'The address must start with http:// or https://.';

type Result = {
  success: boolean;
  code?: string;
  fieldErrors?: Record<string, string[] | string>;
};
type Svc = {
  customers: {
    createCustomer: (a: unknown, i: unknown) => Promise<Result>;
    updateCustomer: (a: unknown, id: string, i: unknown) => Promise<Result>;
  };
  senders: {
    updateSenderProfile: (
      a: unknown,
      id: string,
      i: unknown
    ) => Promise<Result>;
  };
  profile: { updateProfile: (a: unknown, i: unknown) => Promise<Result> };
};

describe.runIf(containerRuntimeAvailable)(
  'web-address rule in services (T16, AC-21)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let svc: Svc;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      svc = {
        customers:
          (await import('@/lib/services/customers/customers')) as unknown as Svc['customers'],
        senders:
          (await import('@/lib/services/sender-profiles/sender-profiles')) as unknown as Svc['senders'],
        profile:
          (await import('@/lib/services/profile/profile')) as unknown as Svc['profile'],
      };
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    afterEach(async () => {
      await truncateAllTables(prisma);
    });

    const base = { name: 'Acme', defaultCurrency: 'USD' };

    it('createCustomer refuses a javascript: website and saves nothing', async () => {
      const f = await createFreelancer(prisma, { email: 't16-a@example.com' });
      const actor = await actingFreelancerForTest(f.id);
      const r = await svc.customers.createCustomer(actor, {
        ...base,
        website: 'javascript:alert(1)',
      });
      expect(r.success).toBe(false);
      expect(r.code).toBe('VALIDATION');
      expect(r.fieldErrors?.website).toEqual([MSG]);
      expect(await prisma.customer.count()).toBe(0);
    });

    it('updateCustomer refuses a data: image, row unchanged; https saves', async () => {
      const f = await createFreelancer(prisma, { email: 't16-b@example.com' });
      const actor = await actingFreelancerForTest(f.id);
      const c = await seedCustomer(prisma, f.id, { name: 'Before' });
      const bad = await svc.customers.updateCustomer(actor, c.id, {
        ...base,
        name: 'After',
        image: 'data:image/png;base64,AAAA',
      });
      expect(bad.code).toBe('VALIDATION');
      expect(bad.fieldErrors?.image).toEqual([MSG]);
      expect(
        (await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).name
      ).toBe('Before');
      const good = await svc.customers.updateCustomer(actor, c.id, {
        ...base,
        name: 'After',
        website: 'https://acme.test',
      });
      expect(good.success).toBe(true);
      expect(
        (await prisma.customer.findUniqueOrThrow({ where: { id: c.id } }))
          .website
      ).toBe('https://acme.test');
    });

    it('updateSenderProfile refuses a javascript: website', async () => {
      const f = await createFreelancer(prisma, { email: 't16-c@example.com' });
      const actor = await actingFreelancerForTest(f.id);
      const sp = await seedSender(prisma, f.id, { invoicePrefix: 'TW' });
      const r = await svc.senders.updateSenderProfile(actor, sp.id, {
        name: 'S',
        invoicePrefix: 'TW',
        website: 'javascript:alert(1)',
      });
      expect(r.code).toBe('VALIDATION');
      expect(r.fieldErrors?.website).toEqual([MSG]);
      expect(
        (await prisma.senderProfile.findUniqueOrThrow({ where: { id: sp.id } }))
          .website
      ).toBeNull();
    });

    it('updateProfile refuses a data: image', async () => {
      const f = await createFreelancer(prisma, { email: 't16-d@example.com' });
      const actor = await actingFreelancerForTest(f.id);
      const r = await svc.profile.updateProfile(actor, {
        name: 'N',
        email: 't16-d@example.com',
        image: 'data:image/png;base64,AAAA',
      });
      expect(r.code).toBe('VALIDATION');
      expect(r.fieldErrors?.image).toEqual([MSG]);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: f.id } })).image
      ).not.toBe('data:image/png;base64,AAAA');
    });
  }
);
