// editor-ux T36 (spec.md AC-04; review 2026-10-10 T-g(b); ADR-0003 per-mount store, ADR-0005 one
// save command) — the totals the editor shows are the totals the database stores, to the cent.
//
// The real save path end to end: the editor store (createInvoiceEditorStore) is built from the real
// getInvoiceEditorData, edited through its own actions, and saved through its own save() command,
// which calls the real createInvoice / updateInvoice server actions against a throwaway Postgres
// (testcontainers). What the editor showed before the save is compared with the stored row, and the
// stored row read back into a fresh editor shows the same figures again.
//
// Awkward cents: 0.1 + 0.2 lines, quantity x price landing on a half cent (1.15 x 0.5 = 0.575),
// tax rates that land on a half cent, and many lines whose float sum drifts.
//
// Seams: same as the other action suites — DATABASE_URL + vi.resetModules() + dynamic import, mock
// '@/auth', stub 'next/cache' and '@sentry/nextjs'. The store's toasts are stubbed (no DOM here).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { createCustomer } from '../../support/factories/customer';
import { createBankAccount } from '../../support/factories/bank-account';
import { createInvoice as seedInvoiceRow } from '../../support/factories/invoice';
import type { InvoiceEditorData, InvoiceFormItem } from '@/types/invoice/types';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@sentry/nextjs', () => ({
  startSpan: (_options: unknown, callback: () => unknown) => callback(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() } }));

type StoreModule = typeof import('@/store/invoice-editor-store/create-invoice-editor-store');
type Actions = typeof import('@/lib/actions/invoice-actions/invoice-actions');
type Store = ReturnType<StoreModule['createInvoiceEditorStore']>;

/** An editor line as the Freelancer types it (quantity, price), with a stable id. */
const typed = (id: string, quantity: number, price: number): InvoiceFormItem => ({
  id,
  productId: 'custom',
  productName: `Line ${id}`,
  description: '',
  unit: 'pcs',
  quantity,
  price,
  total: 0,
});

interface Scenario {
  name: string;
  items: Array<[quantity: number, price: number]>;
  taxRate: number;
  discount: number;
  shipping: number;
}

// Each scenario is one where float math gives a different cent than the exact module.
const SCENARIOS: Scenario[] = [
  { name: '0.1 + 0.2 lines', items: [[1, 0.1], [1, 0.2]], taxRate: 0, discount: 0, shipping: 0 },
  { name: 'a line on a half cent (1.15 x 0.5 = 0.575)', items: [[1.15, 0.5], [0.5, 0.01]], taxRate: 0, discount: 0, shipping: 0 },
  // (10.10 - 0 + 0) x 7.5 % = 0.7575 -> 0.76; (1.15) x 50 % = 0.575 -> 0.58
  { name: 'tax on a half cent', items: [[1, 10.1]], taxRate: 7.5, discount: 0, shipping: 0 },
  { name: 'tax 50 % of 1.15', items: [[1, 1.15]], taxRate: 50, discount: 0, shipping: 0 },
  {
    name: 'many lines with discount, shipping and tax',
    items: Array.from({ length: 40 }, (_, i) => [((i % 7) + 1) * 0.15 + 0.01 * (i % 3), 0.1 * ((i % 5) + 1) + 0.07] as [number, number]).map(
      ([q, p]) => [Number(q.toFixed(2)), Number(p.toFixed(2))] as [number, number]
    ),
    taxRate: 19.25,
    discount: 0.3,
    shipping: 0.7,
  },
];

describe.runIf(containerRuntimeAvailable)('editor totals equal stored totals to the cent (T36, AC-04)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let createInvoiceEditorStore: StoreModule['createInvoiceEditorStore'];
  let actions: Actions;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    actions = await import('@/lib/actions/invoice-actions/invoice-actions');
    ({ createInvoiceEditorStore } = await import('@/store/invoice-editor-store/create-invoice-editor-store'));
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => authMock.mockReset());
  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seedOwner() {
    const freelancer = await createFreelancer(prisma);
    const senderProfile = await createSenderProfile(prisma, freelancer.id);
    const customer = await createCustomer(prisma, freelancer.id);
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    authMock.mockResolvedValue({ user: { id: freelancer.id } });
    return { freelancer, senderProfile, customer, bankAccount };
  }

  async function loadEditor(invoiceId?: string): Promise<Store> {
    const loaded = await actions.getInvoiceEditorData(invoiceId);
    if (!loaded.success) throw new Error(`getInvoiceEditorData failed: ${loaded.error}`);
    return createInvoiceEditorStore(loaded.data as InvoiceEditorData);
  }

  /** Types the scenario into the editor through its own actions, as the form would. */
  function typeScenario(store: Store, s: Scenario) {
    for (const item of store.getState().formData.items) store.getState().deleteItem(item.id);
    s.items.forEach(([quantity, price], i) => {
      store.getState().addCustomItem();
      const added = store.getState().formData.items.at(-1)!;
      store.getState().updateItem(added.id, { ...typed(`${i}`, quantity, price), id: added.id });
    });
    store.getState().updateFields({ taxRate: s.taxRate, discount: s.discount, shipping: s.shipping });
  }

  /** The figures the editor shows, as cents strings. */
  const shown = (store: Store) => {
    const st = store.getState();
    return { subtotal: st.subtotal.toFixed(2), taxAmount: st.taxAmount.toFixed(2), total: st.total.toFixed(2) };
  };

  async function storedRow(id: string) {
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    return { subtotal: row.subtotal.toFixed(2), taxAmount: row.taxAmount.toFixed(2), total: row.total.toFixed(2) };
  }

  /** The editor's figures before the save == the stored row == the editor after the save == a reopened editor. */
  async function expectEditorEqualsStored(store: Store, before: ReturnType<typeof shown>) {
    expect(store.getState().hasUnsavedChanges).toBe(false);
    const id = store.getState().invoiceId!;
    expect(id).toBeTruthy();
    expect(await storedRow(id)).toEqual(before);
    expect(shown(store)).toEqual(before);
    const reopened = await loadEditor(id);
    expect(shown(reopened)).toEqual(before);
  }

  it.each(SCENARIOS)('existing draft, Save: $name', async (s) => {
    const owner = await seedOwner();
    const seeded = await seedInvoiceRow(prisma, owner);
    const store = await loadEditor(seeded.id);
    typeScenario(store, s);
    const before = shown(store);

    await store.getState().save('save');

    expect(store.getState().fieldErrors).toBeUndefined();
    await expectEditorEqualsStored(store, before);
  });

  it.each(SCENARIOS)('new invoice, Save: $name', async (s) => {
    const owner = await seedOwner();
    const store = await loadEditor();
    store.getState().updateFields({
      senderProfileId: owner.senderProfile.id,
      bankAccountId: owner.bankAccount.id,
      customerId: owner.customer.id,
    });
    typeScenario(store, s);
    const before = shown(store);

    await store.getState().save('save');

    expect(store.getState().fieldErrors).toBeUndefined();
    await expectEditorEqualsStored(store, before);
  });

  it('the fixture is awkward: float math gives a different cent than the editor for some scenarios', () => {
    // Guards the fixture: if every scenario were float-safe, this suite could not catch float math.
    const floatTotals = (s: Scenario) => {
      const sub = s.items.reduce((sum, [q, p]) => sum + Math.round(q * p * 100) / 100, 0);
      const base = sub - s.discount + s.shipping;
      const tax = Math.round(base * s.taxRate) / 100;
      return [sub, tax, base + tax].map((n) => n.toFixed(2));
    };
    const exact = (s: Scenario) => {
      const store = createInvoiceEditorStore({
        senderProfiles: [],
        bankAccounts: [],
        customers: [],
        products: [],
        customPrices: [],
        initialData: {
          invoiceNumber: '',
          status: 'DRAFT',
          senderProfileId: '',
          bankAccountId: '',
          customerId: '',
          issueDate: new Date('2026-03-11T00:00:00.000Z'),
          dueDate: new Date('2026-04-10T00:00:00.000Z'),
          currency: 'USD',
          poNumber: '',
          paymentTerms: '',
          items: s.items.map(([q, p], i) => typed(`${i}`, q, p)),
          taxRate: s.taxRate,
          discount: s.discount,
          shipping: s.shipping,
          notes: '',
          terms: '',
        },
      } as InvoiceEditorData);
      const f = shown(store);
      return [f.subtotal, f.taxAmount, f.total];
    };
    const differing = SCENARIOS.filter((s) => JSON.stringify(floatTotals(s)) !== JSON.stringify(exact(s)));
    expect(differing.length).toBeGreaterThanOrEqual(2);
  });
});

describe.runIf(!containerRuntimeAvailable)('editor totals equal stored totals to the cent (T36, AC-04)', () => {
  it.skip('skipped: no container runtime', () => {});
});
