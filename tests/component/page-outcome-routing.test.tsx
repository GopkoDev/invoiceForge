// T26 (spec.md §5 AC-28, AC-29) — every AC-28 data page maps a `FAILED` load result to the
// segment error boundary (SCR-17: retry + Sentry, never an empty state and never "not found"),
// and keeps `NOT_FOUND` mapped to `notFound()` (SCR-16). See
// docs/features/architecture-hardening/tasks/t26-page-outcome-routing.md.
//
// Inlined context (task file, table "Code | When | Page caller", verbatim): `NOT_FOUND` -> page
// caller `notFound()` (SCR-16); `FAILED` -> page caller "throw -> segment error.tsx" (SCR-17).
// AC-28 (verbatim): "... the Freelancer sees an error state with a way to retry, not an empty
// state and not 'page not found' ... 'Not found' is shown only for a record that doesn't exist
// or isn't theirs (AC-29), never for a load failure." test-plan.md row "a failed data load
// routes to the error state and is reported" (AC-28) — driven here at component level per the
// dispatch note ("Mock the loader actions per page with vi.mock... this is where page routing
// lives"); the load-error.tsx / segment error.tsx rendering itself is covered by
// tests/component/load-error-boundaries.test.tsx (T25) and is not re-asserted here.
//
// Seam: same pattern as tests/component/live-account-guard-layouts.test.tsx — pages are async
// Server Components, called directly (not mounted into the DOM). `next/navigation`'s
// `notFound`/`redirect` are mocked to throw a recognisable marker, matching their real Next.js
// behaviour (a thrown "digest" error caught by the framework). Loader actions are mocked with
// `vi.mock` per module so each test drives one action's ActionResult directly.
//
// RED (T26 not yet implemented): every page below currently treats *any* `!result.success` the
// same way, regardless of `code` — see e.g. app/(protected)/customers/page.tsx
// ("if (!result.success) return notFound();"), app/(protected)/sender-profiles/page.tsx
// ("result.success ? result.data : []" — a FAILED load quietly renders as an empty list), and
// app/(invoice-editor)/invoices/[id]/edit/page.tsx ("if (!result.success) { ...; notFound(); }").
// A FAILED result therefore currently resolves to `notFound()` or a silent empty/list render
// instead of throwing for the segment error boundary — the assertions below fail against that
// code, not against a missing export.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const notFoundMock = vi.fn(() => {
  const err = new Error('NEXT_NOT_FOUND');
  (err as unknown as { digest: string }).digest = 'NEXT_HTTP_ERROR_FALLBACK;404';
  throw err;
});
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  redirect: (url: string) => redirectMock(url),
}));

const getCustomersMock = vi.fn();
const getCustomerMock = vi.fn();
vi.mock('@/lib/actions/customer-actions', () => ({
  getCustomers: (...args: unknown[]) => getCustomersMock(...args),
  getCustomer: (...args: unknown[]) => getCustomerMock(...args),
}));

const getProductsMock = vi.fn();
const getProductMock = vi.fn();
vi.mock('@/lib/actions/product-actions', () => ({
  getProducts: (...args: unknown[]) => getProductsMock(...args),
  getProduct: (...args: unknown[]) => getProductMock(...args),
}));

const getSenderProfilesMock = vi.fn();
const getSenderProfileMock = vi.fn();
vi.mock('@/lib/actions/sender-profile-actions', () => ({
  getSenderProfiles: (...args: unknown[]) => getSenderProfilesMock(...args),
  getSenderProfile: (...args: unknown[]) => getSenderProfileMock(...args),
}));

const getPaginatedInvoicesMock = vi.fn();
const getInvoiceEditorDataMock = vi.fn();
const getInvoicesByCustomerMock = vi.fn();
const getInvoicesBySenderProfileMock = vi.fn();
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  getPaginatedInvoices: (...args: unknown[]) => getPaginatedInvoicesMock(...args),
  getInvoiceEditorData: (...args: unknown[]) => getInvoiceEditorDataMock(...args),
  getInvoicesByCustomer: (...args: unknown[]) => getInvoicesByCustomerMock(...args),
  getInvoicesBySenderProfile: (...args: unknown[]) =>
    getInvoicesBySenderProfileMock(...args),
}));

const getCustomerCustomPricesMock = vi.fn();
vi.mock('@/lib/actions/custom-price-actions', () => ({
  getCustomerCustomPrices: (...args: unknown[]) => getCustomerCustomPricesMock(...args),
}));

const getBankAccountsMock = vi.fn();
vi.mock('@/lib/actions/bank-account-actions', () => ({
  getBankAccounts: (...args: unknown[]) => getBankAccountsMock(...args),
}));

import InvoicesPage from '@/app/(protected)/invoices/page';
import CustomersPage from '@/app/(protected)/customers/page';
import ProductsPage from '@/app/(protected)/products/page';
import SenderProfilesPage from '@/app/(protected)/sender-profiles/page';
import CustomerDetailPage from '@/app/(protected)/customers/[id]/page';
import EditProductPage from '@/app/(protected)/products/[id]/edit/page';
import SenderProfileDetailPage from '@/app/(protected)/sender-profiles/[id]/page';
import EditInvoicePage from '@/app/(invoice-editor)/invoices/[id]/edit/page';

// Minimal, common shape for the ActionResult failure branch this suite exercises.
const FAILED = { success: false as const, code: 'FAILED', error: 'Something broke upstream' };
const notFoundResult = (message: string) => ({
  success: false as const,
  code: 'NOT_FOUND',
  error: message,
});

type PageFn = (props: unknown) => unknown;

async function callPage(fn: unknown, props: Record<string, unknown>) {
  return (fn as PageFn)(props);
}

beforeEach(() => {
  notFoundMock.mockClear();
  redirectMock.mockClear();
  getCustomersMock.mockReset();
  getCustomerMock.mockReset();
  getProductsMock.mockReset();
  getProductMock.mockReset();
  getSenderProfilesMock.mockReset();
  getSenderProfileMock.mockReset();
  getPaginatedInvoicesMock.mockReset();
  getInvoiceEditorDataMock.mockReset();
  getInvoicesByCustomerMock.mockReset();
  getInvoicesBySenderProfileMock.mockReset();
  getCustomerCustomPricesMock.mockReset();
  getBankAccountsMock.mockReset();

  // Benign defaults for the secondary Promise.all() loaders on detail pages — each test below
  // only drives the primary record loader.
  getCustomerCustomPricesMock.mockResolvedValue({ success: true, data: [] });
  getInvoicesByCustomerMock.mockResolvedValue({ success: true, data: [] });
  getInvoicesBySenderProfileMock.mockResolvedValue({ success: true, data: [] });
  getBankAccountsMock.mockResolvedValue({ success: true, data: [] });
});

describe('AC-28 — a FAILED load routes to the segment error boundary, not notFound()/empty', () => {
  it('invoices list page: FAILED must not render a "Failed to load" card in place of the list', async () => {
    getPaginatedInvoicesMock.mockResolvedValue(FAILED);

    await expect(
      callPage(InvoicesPage, { searchParams: Promise.resolve({}) })
    ).rejects.toThrow();

    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('customers list page: FAILED must throw, not call notFound()', async () => {
    getCustomersMock.mockResolvedValue(FAILED);

    await expect(
      callPage(CustomersPage, {})
    ).rejects.toThrow();

    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('products list page: FAILED must throw, not call notFound()', async () => {
    getProductsMock.mockResolvedValue(FAILED);

    await expect(
      callPage(ProductsPage, {})
    ).rejects.toThrow();

    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('sender-profiles list page: FAILED must throw, not silently render an empty list', async () => {
    getSenderProfilesMock.mockResolvedValue(FAILED);

    await expect(
      callPage(SenderProfilesPage, {})
    ).rejects.toThrow();
  });

  it('customer detail page: FAILED must throw, not call notFound()', async () => {
    getCustomerMock.mockResolvedValue(FAILED);

    await expect(
      callPage(CustomerDetailPage, { params: Promise.resolve({ id: 'cust_1' }) })
    ).rejects.toThrow();

    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('product edit page: FAILED must throw, not call notFound()', async () => {
    getProductMock.mockResolvedValue(FAILED);

    await expect(
      callPage(EditProductPage, { params: Promise.resolve({ id: 'prod_1' }) })
    ).rejects.toThrow();

    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('sender-profile detail page: FAILED must throw, not call notFound()', async () => {
    getSenderProfileMock.mockResolvedValue(FAILED);

    await expect(
      callPage(SenderProfileDetailPage, { params: Promise.resolve({ id: 'sp_1' }) })
    ).rejects.toThrow();

    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('invoice editor page: FAILED must throw, not call notFound()', async () => {
    getInvoiceEditorDataMock.mockResolvedValue(FAILED);

    await expect(
      callPage(EditInvoicePage, { params: Promise.resolve({ id: 'inv_1' }) })
    ).rejects.toThrow();

    expect(notFoundMock).not.toHaveBeenCalled();
  });
});

describe('AC-28 — a FAILED secondary load on a detail page is an error, never an empty section', () => {
  it('customer detail: custom prices FAILED must throw, not render an empty price list', async () => {
    getCustomerMock.mockResolvedValue({ success: true, data: { id: 'cust_1', name: 'Acme' } });
    getCustomerCustomPricesMock.mockResolvedValue(FAILED);

    await expect(
      callPage(CustomerDetailPage, { params: Promise.resolve({ id: 'cust_1' }) })
    ).rejects.toThrow();
  });

  it('customer detail: related invoices FAILED must throw, not render "no invoices"', async () => {
    getCustomerMock.mockResolvedValue({ success: true, data: { id: 'cust_1', name: 'Acme' } });
    getInvoicesByCustomerMock.mockResolvedValue(FAILED);

    await expect(
      callPage(CustomerDetailPage, { params: Promise.resolve({ id: 'cust_1' }) })
    ).rejects.toThrow();
  });

  it('sender-profile detail: bank accounts FAILED must throw, not render an empty list', async () => {
    getSenderProfileMock.mockResolvedValue({ success: true, data: { id: 'sp_1', name: 'Me' } });
    getBankAccountsMock.mockResolvedValue(FAILED);

    await expect(
      callPage(SenderProfileDetailPage, { params: Promise.resolve({ id: 'sp_1' }) })
    ).rejects.toThrow();
  });
});

describe('AC-29 — NOT_FOUND still routes to notFound(), identical for missing and foreign', () => {
  it('customer detail page: NOT_FOUND calls notFound()', async () => {
    getCustomerMock.mockResolvedValue(notFoundResult('Customer not found.'));

    await expect(
      callPage(CustomerDetailPage, { params: Promise.resolve({ id: 'cust_1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('sender-profile detail page: NOT_FOUND calls notFound()', async () => {
    getSenderProfileMock.mockResolvedValue(notFoundResult('Sender profile not found.'));

    await expect(
      callPage(SenderProfileDetailPage, { params: Promise.resolve({ id: 'sp_1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });
});
