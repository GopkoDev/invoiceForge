// T02 (ADR-0005 hard rule) — the SQL fragment, the Prisma condition and the TS predicate select
// the same invoices over one fixture, at the AC-12 / AC-23 / AC-23b "today" values.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { seedFreelancer } from '../dashboard/harness';
import { createInvoice } from '../../../support/factories/invoice';
import { isOverdue, overdueSql, overdueWhere } from '@/lib/services/_shared/overdue';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe.runIf(containerRuntimeAvailable)('overdue rule forms are equivalent (ADR-0005)', () => {
  let db: TestDatabase;
  let prisma: ReturnType<typeof createTestPrismaClient>;

  beforeAll(async () => {
    db = await startTestDatabase();
    prisma = createTestPrismaClient(db.connectionString);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => truncateAllTables(prisma));

  async function seed() {
    const s = await seedFreelancer(prisma, ['USD']);
    let n = 0;
    const add = (status: 'PENDING' | 'OVERDUE' | 'PAID' | 'DRAFT' | 'CANCELLED', dueDate: Date) =>
      createInvoice(prisma, {
        senderProfile: s.profile,
        customer: s.customer,
        bankAccount: s.bank.USD,
        overrides: {
          status,
          dueDate,
          invoiceNumber: `${s.profile.invoicePrefix}-${String(++n).padStart(4, '0')}`,
        },
      });
    return {
      pendingPast: await add('PENDING', day('2026-10-03')),
      pendingFuture: await add('PENDING', day('2026-10-05')),
      pendingToday: await add('PENDING', day('2026-10-04')),
      pendingLastOfMonth: await add('PENDING', day('2026-09-30')),
      pendingMar14: await add('PENDING', day('2026-03-14')),
      handMarked: await add('OVERDUE', day('2026-10-20')),
      paidPast: await add('PAID', day('2026-09-01')),
      draftPast: await add('DRAFT', day('2026-09-01')),
      cancelledPast: await add('CANCELLED', day('2026-09-01')),
    };
  }

  it.each(['2026-10-04', '2026-10-01', '2026-03-14', '2026-03-15'])(
    'SQL, Prisma and TS forms select the same ids for today = %s',
    async (today) => {
      const rows = await seed();
      const all = Object.values(rows);

      const sqlRows = await prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT i."id" FROM "Invoice" i WHERE ${overdueSql(today)}`,
      );
      const prismaRows = await prisma.invoice.findMany({ where: overdueWhere(today), select: { id: true } });
      const tsIds = all.filter((r) => isOverdue(r, today)).map((r) => r.id);

      const sorted = (ids: string[]) => [...ids].sort();
      expect(sorted(sqlRows.map((r) => r.id))).toEqual(sorted(tsIds));
      expect(sorted(prismaRows.map((r) => r.id))).toEqual(sorted(tsIds));
      // non-vacuous: hand-marked is always in, paid/draft/cancelled never
      expect(tsIds).toContain(rows.handMarked.id);
      expect(tsIds).not.toContain(rows.paidPast.id);
      expect(tsIds).not.toContain(rows.draftPast.id);
      expect(tsIds).not.toContain(rows.cancelledPast.id);
    },
    120_000,
  );

  it('at today = 2026-10-04 the expected set is exact', async () => {
    const rows = await seed();
    const ids = (await prisma.invoice.findMany({ where: overdueWhere('2026-10-04'), select: { id: true } })).map(
      (r) => r.id,
    );
    expect(ids.sort()).toEqual(
      [rows.pendingPast, rows.pendingLastOfMonth, rows.pendingMar14, rows.handMarked].map((r) => r.id).sort(),
    );
  }, 120_000);
});
