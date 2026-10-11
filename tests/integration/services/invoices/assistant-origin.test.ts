// T06 (spec.md §5 AC-23; ADR-0013) — the Assistant origin is written once at creation from a separate
// argument, never by updateInvoice / duplicateInvoice, and every invoice read DTO exposes
// assistantMark only while the stored status is DRAFT.
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
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { withLoadedVersion } from '../../../support/loaded-version';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

vi.mock('@sentry/nextjs', () => ({
  startSpan: (_options: unknown, callback: () => unknown) => callback(),
  captureMessage: vi.fn(),
}));

type Origin =
  | { origin: 'CHAT' }
  | { origin: 'PERSONAL_KEY'; keyId: string; keyName: string };
type Result = {
  success: boolean;
  code?: string;
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
type Svc = {
  createInvoice: (a: unknown, input: unknown, origin?: Origin) => Promise<Result>;
  updateInvoice: (a: unknown, id: string, input: unknown) => Promise<Result>;
  updateInvoiceStatus: (a: unknown, id: string, status: string) => Promise<Result>;
  duplicateInvoice: (a: unknown, id: string) => Promise<Result>;
  getInvoice: (a: unknown, id: string) => Promise<Result>;
  listInvoices: (a: unknown, q?: unknown) => Promise<Result>;
};

describe.runIf(containerRuntimeAvailable)('Assistant origin on the invoice (T06, AC-23)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;
  let editor: { getInvoiceEditorData: (a: unknown, id?: string) => Promise<Result> };
  let dashboard: { getRecentInvoices: (a: unknown, c: string) => Promise<Result> };

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/invoices/invoices')) as unknown as Svc;
    editor = (await import('@/lib/services/invoices/editor-data')) as unknown as typeof editor;
    dashboard = (await import('@/lib/services/dashboard/dashboard')) as unknown as typeof dashboard;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seed() {
    const user = await createFreelancer(prisma, { email: 't06-origin@example.com' });
    const senderProfile = await createSenderProfile(prisma, user.id, { invoiceCounter: 4 });
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, user.id, { name: '1 cust' });
    const actor = await actingFreelancerForTest(user.id);
    const { row: key } = await createPersonalKey(prisma, user.id, { name: 'Claude Desktop' });
    return { user, senderProfile, bankAccount, customer, actor, key };
  }
  type Seed = Awaited<ReturnType<typeof seed>>;

  function form(s: Seed, overrides: Record<string, unknown> = {}) {
    return {
      invoiceNumber: '',
      status: 'DRAFT',
      senderProfileId: s.senderProfile.id,
      bankAccountId: s.bankAccount.id,
      customerId: s.customer.id,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
      currency: 'USD',
      poNumber: '',
      paymentTerms: '',
      taxRate: 0,
      discount: 0,
      shipping: 0,
      notes: '',
      terms: '',
      items: [{ id: 'item-0', productName: 'Widget', unit: 'pcs', quantity: 1, price: 100, total: 100 }],
      ...overrides,
    };
  }
  const stored = (id: string) => prisma.invoice.findUniqueOrThrow({ where: { id } });
  const originCols = (id: string) =>
    stored(id).then((r) => ({
      assistantOrigin: r.assistantOrigin,
      assistantKeyName: r.assistantKeyName,
      assistantKeyId: r.assistantKeyId,
    }));
  const NO_ORIGIN = { assistantOrigin: null, assistantKeyName: null, assistantKeyId: null };

  it('AC-23: a chat origin passed as the separate argument is stored once', async () => {
    const s = await seed();
    const res = await svc.createInvoice(s.actor, form(s), { origin: 'CHAT' });
    expect(res.success).toBe(true);
    expect(await originCols(res.data.id)).toEqual({ ...NO_ORIGIN, assistantOrigin: 'CHAT' });
  });

  it('AC-23: a Personal key origin stores the key name and id as they were at creation', async () => {
    const s = await seed();
    const res = await svc.createInvoice(s.actor, form(s), {
      origin: 'PERSONAL_KEY',
      keyId: s.key.id,
      keyName: s.key.name,
    });
    expect(res.success).toBe(true);
    expect(await originCols(res.data.id)).toEqual({
      assistantOrigin: 'PERSONAL_KEY',
      assistantKeyName: 'Claude Desktop',
      assistantKeyId: s.key.id,
    });
    await prisma.personalKey.update({ where: { id: s.key.id }, data: { name: 'Renamed', revokedAt: new Date(), activeNameKey: null } });
    expect((await originCols(res.data.id)).assistantKeyName).toBe('Claude Desktop');
    await prisma.personalKey.delete({ where: { id: s.key.id } });
    expect(await originCols(res.data.id)).toMatchObject({ assistantKeyId: null, assistantKeyName: 'Claude Desktop' });
  });

  it('AC-23: no origin argument means made by hand; an origin smuggled into the form is ignored', async () => {
    const s = await seed();
    const plain = await svc.createInvoice(s.actor, form(s));
    expect(await originCols(plain.data.id)).toEqual(NO_ORIGIN);
    const smuggled = await svc.createInvoice(
      s.actor,
      form(s, { assistantOrigin: 'CHAT', assistantKeyName: 'x', assistantKeyId: s.key.id })
    );
    expect(smuggled.success).toBe(true);
    expect(await originCols(smuggled.data.id)).toEqual(NO_ORIGIN);
  });

  it('AC-23: updateInvoice never writes or clears the origin, even when the form carries one', async () => {
    const s = await seed();
    const created = await svc.createInvoice(s.actor, form(s), { origin: 'CHAT' });
    const id = created.data.id;
    const input = await withLoadedVersion(
      prisma,
      id,
      form(s, { invoiceNumber: created.data.invoiceNumber, notes: 'edited', assistantOrigin: null, assistantKeyName: 'evil' })
    );
    const res = await svc.updateInvoice(s.actor, id, input);
    expect(res.success).toBe(true);
    expect((await stored(id)).notes).toBe('edited');
    expect(await originCols(id)).toEqual({ ...NO_ORIGIN, assistantOrigin: 'CHAT' });

    const plain = await svc.createInvoice(s.actor, form(s));
    const upd = await svc.updateInvoice(
      s.actor,
      plain.data.id,
      await withLoadedVersion(prisma, plain.data.id, form(s, { invoiceNumber: plain.data.invoiceNumber, assistantOrigin: 'CHAT' }))
    );
    expect(upd.success).toBe(true);
    expect(await originCols(plain.data.id)).toEqual(NO_ORIGIN);
  });

  it('AC-23: duplicateInvoice never copies the origin and leaves issuedAt NULL', async () => {
    const s = await seed();
    const created = await svc.createInvoice(s.actor, form(s), {
      origin: 'PERSONAL_KEY',
      keyId: s.key.id,
      keyName: s.key.name,
    });
    await svc.updateInvoiceStatus(s.actor, created.data.id, 'PENDING');
    const copy = await svc.duplicateInvoice(s.actor, created.data.id);
    expect(copy.success).toBe(true);
    expect(await originCols(copy.data.id)).toEqual(NO_ORIGIN);
    expect((await stored(copy.data.id)).issuedAt).toBeNull();
  });

  it('AC-23: assistantMark is exposed on getInvoice, list, recent and editor reads while DRAFT, and gone once issued', async () => {
    const s = await seed();
    const chat = (await svc.createInvoice(s.actor, form(s), { origin: 'CHAT' })).data.id as string;
    const keyed = (
      await svc.createInvoice(s.actor, form(s), { origin: 'PERSONAL_KEY', keyId: s.key.id, keyName: s.key.name })
    ).data.id as string;
    const manual = (await svc.createInvoice(s.actor, form(s))).data.id as string;

    const marks = async () => {
      const list = await svc.listInvoices(s.actor, { pageSize: 50 });
      const byId = new Map<string, unknown>(list.data.items.map((i: any) => [i.id, i.assistantMark])); // eslint-disable-line @typescript-eslint/no-explicit-any
      const recent = await dashboard.getRecentInvoices(s.actor, 'USD');
      const recentById = new Map<string, unknown>(recent.data.map((i: any) => [i.id, i.assistantMark])); // eslint-disable-line @typescript-eslint/no-explicit-any
      return {
        get: async (id: string) => (await svc.getInvoice(s.actor, id)).data.assistantMark,
        editor: async (id: string) => (await editor.getInvoiceEditorData(s.actor, id)).data?.assistantMark,
        list: (id: string) => byId.get(id),
        recent: (id: string) => recentById.get(id),
      };
    };

    const m = await marks();
    for (const read of [m.get, m.editor, async (id: string) => m.list(id), async (id: string) => m.recent(id)]) {
      expect(await read(chat)).toEqual({ origin: 'CHAT' });
      expect(await read(keyed)).toEqual({ origin: 'PERSONAL_KEY', keyName: 'Claude Desktop' });
      expect(await read(manual)).toBeNull();
    }

    // Renaming the key later does not change the mark.
    await prisma.personalKey.update({ where: { id: s.key.id }, data: { name: 'Renamed', activeNameKey: 'renamed' } });
    expect((await (await marks()).get(keyed))).toEqual({ origin: 'PERSONAL_KEY', keyName: 'Claude Desktop' });

    // Issued: the mark is gone everywhere but the columns stay.
    await svc.updateInvoiceStatus(s.actor, chat, 'PENDING');
    await svc.updateInvoiceStatus(s.actor, keyed, 'PENDING');
    const after = await marks();
    for (const id of [chat, keyed]) {
      expect(await after.get(id)).toBeNull();
      expect(await after.editor(id)).toBeNull();
      expect(after.list(id)).toBeNull();
      expect(after.recent(id)).toBeNull();
    }
    expect((await originCols(chat)).assistantOrigin).toBe('CHAT');

    // An issued invoice never returns to draft (lifecycle): the revert is refused, the mark stays
    // hidden and the origin columns are untouched.
    const revert = await svc.updateInvoiceStatus(s.actor, chat, 'DRAFT');
    expect(revert.success).toBe(false);
    expect(await (await marks()).get(chat)).toBeNull();
    expect((await originCols(chat)).assistantOrigin).toBe('CHAT');
  });
});
