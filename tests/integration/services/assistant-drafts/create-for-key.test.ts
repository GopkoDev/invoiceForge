// T21 (ai-assistant; spec.md §5 AC-27, AC-30, AC-31, AC-32, AC-17, AC-29; ADR-0012): an Assistant with a Draft-permission
// Personal key creates a Draft invoice - permission first, then the repeat mark, then the resolver, then one
// transaction (key slot + invoice + repeat row).
// Expected production modules:
//   lib/services/assistant-drafts/create-for-key.ts exporting
//     createDraftForKey(actor, key: { id; name; canCreateDrafts }, input: CreateDraftInvoiceInput, now: Date)
//       -> Promise<ActionResult<DraftCreatedAnswer>>
//   lib/services/assistant-drafts/repeat-marks.ts (repeat read / stale delete / write / race re-read)
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createCustomer } from '../../../support/factories/customer';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createPersonalKey } from '../../../support/factories/personal-key';
import { createPersonalKeyDraftDay } from '../../../support/factories/personal-key-draft-day';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { dayToUtcDate, todayInZone } from '@/lib/helpers/calendar-day';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TZ = 'Europe/Kyiv';
const NOW = new Date();
const HOUR = 3_600_000;

type Result =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the result shapes are read loosely across outcomes
  | { success: true; data: Record<string, any> }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the result shapes are read loosely across outcomes
  | { success: false; code: string; error?: string; details?: Record<string, any> };
type Key = { id: string; name: string; canCreateDrafts: boolean };
type Svc = {
  createDraftForKey: (actor: unknown, key: Key, input: unknown, now: Date) => Promise<Result>;
};

describe.runIf(containerRuntimeAvailable)('createDraftForKey (T21)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/assistant-drafts/create-for-key')) as unknown as Svc;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  const LINES = [{ description: 'consulting', quantity: '20', unit: 'hours', price: '50' }];
  const REQUEST = { customer: 'Acme', lines: LINES };

  async function setup(opts: { canCreateDrafts?: boolean; withProfile?: boolean } = {}) {
    const user = await createFreelancer(prisma, { email: 't21@example.com', timeZone: TZ });
    if (opts.withProfile !== false) {
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'USD' });
    }
    const acme = await createCustomer(prisma, user.id, { name: 'Acme Corp' });
    const { row } = await createPersonalKey(prisma, user.id, {
      name: 'Claude Desktop',
      canCreateDrafts: opts.canCreateDrafts ?? true,
    });
    const key: Key = { id: row.id, name: row.name, canCreateDrafts: row.canCreateDrafts };
    return { user, acme, key, actor: await actingFreelancerForTest(user.id, TZ) };
  }

  const today = () => dayToUtcDate(todayInZone(TZ, NOW));

  it('AC-30: creates a Draft invoice with origin PERSONAL_KEY, the key name and id, a key slot, and lists the defaults and link', async () => {
    const s = await setup();

    const res = await svc.createDraftForKey(s.actor, s.key, REQUEST, NOW);

    expect(res.success).toBe(true);
    if (!res.success) return;
    const invoices = await prisma.invoice.findMany({ include: { items: true } });
    expect(invoices).toHaveLength(1);
    const inv = invoices[0];
    expect(inv.status).toBe('DRAFT');
    expect(inv.assistantOrigin).toBe('PERSONAL_KEY');
    expect(inv.assistantKeyName).toBe('Claude Desktop');
    expect(inv.assistantKeyId).toBe(s.key.id);
    expect(inv.customerId).toBe(s.acme.id);
    expect(Number(inv.total)).toBe(1000);
    expect(inv.items).toHaveLength(1);

    expect(res.data).toMatchObject({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: 'DRAFT',
      repeated: false,
    });
    expect(res.data.link).toMatch(/^https?:\/\/.+\/invoices\/.+\/edit$/);
    expect(res.data.link.endsWith(`/invoices/${inv.id}/edit`)).toBe(true);
    expect(res.data.draft.customer.customerId).toBe(s.acme.id);
    expect(res.data.draft.invoiceNumber).toBe(inv.invoiceNumber);
    expect(res.data.draft.issueDate.source).toBe('DEFAULT');

    const day = await prisma.personalKeyDraftDay.findUniqueOrThrow({
      where: { personalKeyId_day: { personalKeyId: s.key.id, day: today() } },
    });
    expect(day.created).toBe(1);
  });

  it('AC-29: a key without Draft permission is FORBIDDEN and nothing is written', async () => {
    const s = await setup({ canCreateDrafts: false });

    const res = await svc.createDraftForKey(s.actor, s.key, { ...REQUEST, repeatKey: 'r1' }, NOW);

    expect(res).toMatchObject({ success: false, code: 'FORBIDDEN' });
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.personalKeyDraftDay.count()).toBe(0);
    expect(await prisma.mcpDraftRepeat.count()).toBe(0);
  });

  describe('refusals create nothing and take no slot', () => {
    it('AC-31: two Customers match "Acme" -> VALIDATION with DRAFT_ISSUES naming the matches', async () => {
      const s = await setup();
      await createCustomer(prisma, s.user.id, { name: 'Acme Ltd', email: 'ltd@example.com' });

      const res = await svc.createDraftForKey(s.actor, s.key, { ...REQUEST, repeatKey: 'r2' }, NOW);

      expect(res).toMatchObject({ success: false, code: 'VALIDATION', details: { kind: 'DRAFT_ISSUES' } });
      if (res.success) return;
      expect(res.details?.issues.length).toBeGreaterThan(0);
      expect(JSON.stringify(res.details?.issues)).toContain('Acme');
      expect(await prisma.invoice.count()).toBe(0);
      expect(await prisma.personalKeyDraftDay.count()).toBe(0);
      expect(await prisma.mcpDraftRepeat.count()).toBe(0);
    });

    it('AC-31: a line with no quantity or price that matches no product -> DRAFT_ISSUES', async () => {
      const s = await setup();

      const res = await svc.createDraftForKey(s.actor, s.key, { customer: 'Acme', lines: [{ description: 'mystery' }] }, NOW);

      expect(res).toMatchObject({ success: false, code: 'VALIDATION', details: { kind: 'DRAFT_ISSUES' } });
      expect(await prisma.invoice.count()).toBe(0);
      expect(await prisma.personalKeyDraftDay.count()).toBe(0);
    });

    it('AC-17: a Freelancer with no sender profile and bank account -> DRAFT_ISSUES, nothing created', async () => {
      const s = await setup({ withProfile: false });

      const res = await svc.createDraftForKey(s.actor, s.key, REQUEST, NOW);

      expect(res).toMatchObject({ success: false, code: 'VALIDATION', details: { kind: 'DRAFT_ISSUES' } });
      expect(await prisma.invoice.count()).toBe(0);
      expect(await prisma.personalKeyDraftDay.count()).toBe(0);
    });
  });

  describe('AC-27: the key daily limit', () => {
    it('the 51st draft is RATE_LIMITED with DRAFT_LIMIT_REACHED; nothing is created, nothing else changes', async () => {
      const s = await setup();
      await createPersonalKeyDraftDay(prisma, { personalKeyId: s.key.id, day: today(), created: 50 });

      const res = await svc.createDraftForKey(s.actor, s.key, { ...REQUEST, repeatKey: 'r3' }, NOW);

      expect(res).toMatchObject({
        success: false,
        code: 'RATE_LIMITED',
        details: { kind: 'DRAFT_LIMIT_REACHED', created: 50, allowance: 50 },
      });
      if (res.success) return;
      expect(typeof res.details?.renewsAt).toBe('string');
      expect(await prisma.invoice.count()).toBe(0);
      expect(await prisma.mcpDraftRepeat.count()).toBe(0);
      const day = await prisma.personalKeyDraftDay.findFirstOrThrow({ where: { personalKeyId: s.key.id } });
      expect(day.created).toBe(50);
    });

    it('a repeat of an earlier success still returns the first draft when the limit is reached (repeat check precedes the slot)', async () => {
      const s = await setup();
      const first = await svc.createDraftForKey(s.actor, s.key, { ...REQUEST, repeatKey: 'r4' }, NOW);
      if (!first.success) throw new Error('first create failed');
      await prisma.personalKeyDraftDay.updateMany({ where: { personalKeyId: s.key.id }, data: { created: 50 } });

      const again = await svc.createDraftForKey(s.actor, s.key, { ...REQUEST, repeatKey: 'r4' }, NOW);

      expect(again.success).toBe(true);
      if (!again.success) return;
      expect(again.data).toMatchObject({ invoiceId: first.data.invoiceId, repeated: true });
    });
  });

  describe('AC-32: repeat marks', () => {
    it('the same mark and content within 24 h returns the first draft; no second invoice, no second slot', async () => {
      const s = await setup();
      const first = await svc.createDraftForKey(s.actor, s.key, { ...REQUEST, repeatKey: 'r5' }, NOW);
      if (!first.success) throw new Error('first create failed');

      const again = await svc.createDraftForKey(s.actor, s.key, { ...REQUEST, repeatKey: 'r5' }, new Date(NOW.getTime() + HOUR));

      expect(again.success).toBe(true);
      if (!again.success) return;
      expect(again.data).toMatchObject({
        invoiceId: first.data.invoiceId,
        invoiceNumber: first.data.invoiceNumber,
        status: 'DRAFT',
        repeated: true,
      });
      expect(again.data.link).toBe(first.data.link);
      expect(await prisma.invoice.count()).toBe(1);
      const day = await prisma.personalKeyDraftDay.findFirstOrThrow({ where: { personalKeyId: s.key.id } });
      expect(day.created).toBe(1);
      const marks = await prisma.mcpDraftRepeat.findMany();
      expect(marks).toHaveLength(1);
      expect(marks[0]).toMatchObject({ personalKeyId: s.key.id, repeatKey: 'r5', invoiceId: first.data.invoiceId });
      expect(marks[0].fingerprint).toMatch(/^[0-9a-f]{64}$/);
    });

    it('the same mark with different content is CONFLICT and nothing is created', async () => {
      const s = await setup();
      await svc.createDraftForKey(s.actor, s.key, { ...REQUEST, repeatKey: 'r6' }, NOW);

      const res = await svc.createDraftForKey(
        s.actor,
        s.key,
        { customer: 'Acme', lines: [{ description: 'consulting', quantity: '25', unit: 'hours', price: '50' }], repeatKey: 'r6' },
        NOW
      );

      expect(res).toMatchObject({ success: false, code: 'CONFLICT' });
      expect(await prisma.invoice.count()).toBe(1);
    });

    it('an identical request without a repeat mark creates a new draft', async () => {
      const s = await setup();
      await svc.createDraftForKey(s.actor, s.key, REQUEST, NOW);

      const again = await svc.createDraftForKey(s.actor, s.key, REQUEST, NOW);

      expect(again.success && again.data.repeated).toBe(false);
      expect(await prisma.invoice.count()).toBe(2);
      expect(await prisma.mcpDraftRepeat.count()).toBe(0);
    });

    it('a mark older than 24 h (not yet purged) is replaced: the request is treated as new', async () => {
      const s = await setup();
      const first = await svc.createDraftForKey(s.actor, s.key, { ...REQUEST, repeatKey: 'r7' }, NOW);
      if (!first.success) throw new Error('first create failed');
      await prisma.mcpDraftRepeat.updateMany({ data: { createdAt: new Date(NOW.getTime() - 25 * HOUR) } });

      const again = await svc.createDraftForKey(s.actor, s.key, { ...REQUEST, repeatKey: 'r7' }, NOW);

      expect(again.success).toBe(true);
      if (!again.success) return;
      expect(again.data.repeated).toBe(false);
      expect(again.data.invoiceId).not.toBe(first.data.invoiceId);
      expect(await prisma.invoice.count()).toBe(2);
      const marks = await prisma.mcpDraftRepeat.findMany();
      expect(marks).toHaveLength(1);
      expect(marks[0].invoiceId).toBe(again.data.invoiceId);
    });

    it('two racing repeats create exactly one invoice and both answers point to it', async () => {
      const s = await setup();
      const input = { ...REQUEST, repeatKey: 'r8' };

      const [a, b] = await Promise.all([
        svc.createDraftForKey(s.actor, s.key, input, NOW),
        svc.createDraftForKey(s.actor, s.key, input, NOW),
      ]);

      expect(a.success && b.success).toBe(true);
      if (!a.success || !b.success) return;
      expect(a.data.invoiceId).toBe(b.data.invoiceId);
      expect([a.data.repeated, b.data.repeated].sort()).toEqual([false, true]);
      expect(await prisma.invoice.count()).toBe(1);
      expect(await prisma.mcpDraftRepeat.count()).toBe(1);
      const day = await prisma.personalKeyDraftDay.findFirstOrThrow({ where: { personalKeyId: s.key.id } });
      expect(day.created).toBe(1);
    });

    it('a mark whose first draft was deleted since is NOT_FOUND and creates nothing new', async () => {
      const s = await setup();
      const first = await svc.createDraftForKey(s.actor, s.key, { ...REQUEST, repeatKey: 'r9' }, NOW);
      if (!first.success) throw new Error('first create failed');
      await prisma.invoice.delete({ where: { id: first.data.invoiceId } });

      const again = await svc.createDraftForKey(s.actor, s.key, { ...REQUEST, repeatKey: 'r9' }, NOW);

      expect(again).toMatchObject({ success: false, code: 'NOT_FOUND' });
      expect(await prisma.invoice.count()).toBe(0);
    });
  });
});
