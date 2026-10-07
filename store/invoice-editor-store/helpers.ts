import {
  InvoiceFormData,
  InvoiceFormItem,
  InvoiceSenderProfile,
  InvoiceCustomer,
  InvoiceBankAccount,
  InvoiceProduct,
  InvoiceCustomPrice,
  InvoiceStatus,
  Currency,
} from '@/types/invoice/types';
import {
  EditorMode,
  NormalizedData,
  ComputedValues,
  SenderProfileOption,
  ProductOption,
  GroupedProducts,
  RecalculateComputedValuesStateInput,
  LoadedDates,
} from './types';
import { v4 as uuidv4 } from 'uuid';
import {
  computeInvoiceAmounts,
  decimalStringToNumber,
} from '@/lib/helpers/invoice-calculations';
import { localDateToDay, storedDayToLocalDate } from '@/lib/helpers/calendar-day';
import type { InvoiceFormInput } from '@/lib/validations/invoice';

// ============================================
// Normalization functions
// ============================================

export function normalizeData(params: {
  senderProfiles: InvoiceSenderProfile[];
  bankAccounts: InvoiceBankAccount[];
  customers: InvoiceCustomer[];
  products: InvoiceProduct[];
  customPrices: InvoiceCustomPrice[];
}): NormalizedData {
  const senderProfilesById = new Map<string, InvoiceSenderProfile>();
  const bankAccountsById = new Map<string, InvoiceBankAccount>();
  const customersById = new Map<string, InvoiceCustomer>();
  const productsById = new Map<string, InvoiceProduct>();
  const customPricesByProductId = new Map<string, InvoiceCustomPrice[]>();
  const customPricesByCustomerId = new Map<string, InvoiceCustomPrice[]>();
  const bankAccountsBySenderProfileId = new Map<string, InvoiceBankAccount[]>();

  // Normalize sender profiles
  params.senderProfiles.forEach((profile) => {
    senderProfilesById.set(profile.id, profile);
  });

  // Normalize bank accounts and group by sender profile
  params.bankAccounts.forEach((account) => {
    bankAccountsById.set(account.id, account);

    const existing =
      bankAccountsBySenderProfileId.get(account.senderProfileId) || [];
    bankAccountsBySenderProfileId.set(account.senderProfileId, [
      ...existing,
      account,
    ]);
  });

  // Normalize customers
  params.customers.forEach((customer) => {
    customersById.set(customer.id, customer);
  });

  // Normalize products
  params.products.forEach((product) => {
    productsById.set(product.id, product);
  });

  // Normalize custom prices - group by both productId and customerId
  params.customPrices.forEach((customPrice) => {
    // Group by product
    const byProduct = customPricesByProductId.get(customPrice.productId) || [];
    customPricesByProductId.set(customPrice.productId, [
      ...byProduct,
      customPrice,
    ]);

    // Group by customer
    const byCustomer =
      customPricesByCustomerId.get(customPrice.customerId) || [];
    customPricesByCustomerId.set(customPrice.customerId, [
      ...byCustomer,
      customPrice,
    ]);
  });

  return {
    senderProfilesById,
    bankAccountsById,
    customersById,
    productsById,
    customPricesByProductId,
    customPricesByCustomerId,
    bankAccountsBySenderProfileId,
  };
}

// ============================================
// Filtering and grouping functions
// ============================================

function _filterProductsByCurrency(
  products: InvoiceProduct[],
  currency: Currency
): InvoiceProduct[] {
  return products.filter(
    (product) => product.currency === currency && product.isActive
  );
}

function _createSenderProfileOptions(
  senderProfiles: InvoiceSenderProfile[],
  bankAccountsBySenderProfileId: Map<string, InvoiceBankAccount[]>
): SenderProfileOption[] {
  return senderProfiles.map((profile) => {
    const bankAccounts = bankAccountsBySenderProfileId.get(profile.id) || [];
    return {
      ...profile,
      hasBankAccounts: bankAccounts.length > 0,
      bankAccountCount: bankAccounts.length,
    };
  });
}

function _groupProductsByCustomPrice(
  products: InvoiceProduct[],
  customPricesByCustomerId: Map<string, InvoiceCustomPrice[]>,
  customerId: string,
  currency: Currency
): GroupedProducts {
  const customerCustomPrices = customPricesByCustomerId.get(customerId) || [];
  const customPriceProductIds = new Set(
    customerCustomPrices.map((cp) => cp.productId)
  );

  const filteredProducts = _filterProductsByCurrency(products, currency);

  const withCustomPrices: ProductOption[] = [];
  const regular: ProductOption[] = [];

  filteredProducts.forEach((product) => {
    const customPrice = customerCustomPrices.find(
      (cp) => cp.productId === product.id
    );
    const productOption: ProductOption = {
      ...product,
      hasCustomPrice: customPriceProductIds.has(product.id),
      customPrice: customPrice?.price,
    };

    if (customPriceProductIds.has(product.id)) {
      withCustomPrices.push(productOption);
    } else {
      regular.push(productOption);
    }
  });

  return { withCustomPrices, regular };
}

// ============================================
// Computed values
// ============================================

export function recalculateComputedValues(
  state: RecalculateComputedValuesStateInput
): ComputedValues {
  const { senderProfilesById, formData, customersById, bankAccountsById } =
    state;

  const selectedSenderProfile = senderProfilesById.get(
    formData.senderProfileId
  );

  const selectedCustomer = customersById.get(formData.customerId);

  const selectedBankAccount = bankAccountsById.get(
    state.formData.bankAccountId
  );

  // Currency comes from selected bank account
  const invoiceCurrency =
    selectedBankAccount?.currency || state.formData.currency;

  // Every line counts: lines are never dropped automatically (invoice-integrity AC-15). The shared
  // exact-decimal module keeps the displayed totals equal to what the server stores (ADR-0006).
  const amounts = computeInvoiceAmounts({
    items: state.formData.items.map((item) => ({
      quantity: item.quantity,
      price: item.price,
    })),
    discount: state.formData.discount,
    shipping: state.formData.shipping,
    taxRate: state.formData.taxRate,
  });
  const subtotal = decimalStringToNumber(amounts.subtotal);
  const taxAmount = decimalStringToNumber(amounts.taxAmount);
  const total = decimalStringToNumber(amounts.total);

  // Filter products by invoice currency
  const filteredProducts = _filterProductsByCurrency(
    state.products,
    invoiceCurrency
  );

  // Group products by custom prices for selected customer
  const groupedProducts = _groupProductsByCustomPrice(
    state.products,
    state.customPricesByCustomerId,
    state.formData.customerId,
    invoiceCurrency
  );

  // Create sender profile options with bank account info
  const senderProfileOptions = _createSenderProfileOptions(
    state.senderProfiles,
    state.bankAccountsBySenderProfileId
  );

  // Get available bank accounts for selected sender
  const availableBankAccounts =
    state.bankAccountsBySenderProfileId.get(formData.senderProfileId) || [];

  return {
    subtotal,
    taxAmount,
    total,
    selectedSenderProfile,
    selectedCustomer,
    selectedBankAccount,
    invoiceCurrency,
    filteredProducts,
    groupedProducts,
    senderProfileOptions,
    availableBankAccounts,
  };
}

// ============================================
// Initial form data
// ============================================

// T25 (spec.md §1, review-2026-10-05 F-02): the form holds the issue and due dates as local Dates
// (what the Calendar shows and picks). They are calendar days: a day saved on the server comes in as
// its UTC midnight and is turned into the local Date with the same Y/M/D, and a save sends the
// picked day as `yyyy-MM-dd`, so no browser zone ever shifts it.

/** `data` with its stored issue and due days as local Dates showing the same Y/M/D. */
export function withLocalDays(data: InvoiceFormData): InvoiceFormData {
  return {
    ...data,
    issueDate: storedDayToLocalDate(data.issueDate),
    dueDate: storedDayToLocalDate(data.dueDate),
  };
}

/** The stored instants of `data`, or null when it holds no valid dates. */
export function loadedDatesOf(data: InvoiceFormData): LoadedDates | null {
  const issue = new Date(data.issueDate);
  const due = new Date(data.dueDate);
  if (Number.isNaN(issue.getTime()) || Number.isNaN(due.getTime())) return null;
  return { issueDate: issue.toISOString(), dueDate: due.toISOString() };
}

/** The editor form as the create/update actions take it: the days as `yyyy-MM-dd`. */
export function toSavePayload(
  formData: InvoiceFormData,
  confirmedTotals?: InvoiceFormInput['confirmedTotals'],
  loadedDates?: LoadedDates | null,
  loadedVersion?: number | null
): InvoiceFormInput & { loadedVersion?: number } {
  return {
    ...formData,
    // invoice-integrity T18 (AC-10, ADR-0004): the version this editor loaded; updateInvoice refuses an
    // outdated one. createInvoice ignores it.
    ...(loadedVersion !== null && loadedVersion !== undefined ? { loadedVersion } : {}),
    issueDate: localDateToDay(formData.issueDate),
    dueDate: localDateToDay(formData.dueDate),
    ...(loadedDates
      ? { loadedIssueDate: loadedDates.issueDate, loadedDueDate: loadedDates.dueDate }
      : {}),
    ...(confirmedTotals ? { confirmedTotals } : {}),
  };
}

function localToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function createInitialFormData(): InvoiceFormData {
  const today = localToday();
  return {
    invoiceNumber: '',
    status: 'DRAFT' as InvoiceStatus,
    senderProfileId: '',
    bankAccountId: '',
    customerId: '',
    issueDate: today,
    dueDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30), // +30 calendar days
    currency: 'USD' as Currency,
    poNumber: '',
    paymentTerms: '',
    items: [],
    taxRate: 0,
    discount: 0,
    shipping: 0,
    notes: '',
    terms: '',
  };
}

export function createNewItem(): InvoiceFormItem {
  return {
    id: uuidv4(),
    productId: '',
    productName: '',
    description: '',
    unit: 'pcs',
    quantity: 1,
    price: 0,
    total: 0,
  };
}

export function createEmptyComputedValues(): ComputedValues {
  return {
    subtotal: 0,
    taxAmount: 0,
    total: 0,
    selectedSenderProfile: undefined,
    selectedCustomer: undefined,
    selectedBankAccount: undefined,
    invoiceCurrency: 'USD' as const,
    filteredProducts: [],
    groupedProducts: { withCustomPrices: [], regular: [] },
    senderProfileOptions: [],
    availableBankAccounts: [],
  };
}

export function createEmptyNormalizedData(): NormalizedData {
  return {
    senderProfilesById: new Map<string, InvoiceSenderProfile>(),
    bankAccountsById: new Map<string, InvoiceBankAccount>(),
    customersById: new Map<string, InvoiceCustomer>(),
    productsById: new Map<string, InvoiceProduct>(),
    customPricesByProductId: new Map(),
    customPricesByCustomerId: new Map(),
    bankAccountsBySenderProfileId: new Map(),
  };
}

/** The editor's mode from the stored status (invoice-integrity T16, SCR-02). */
export function editorModeOf(invoiceId: string | undefined, storedStatus: InvoiceStatus | null): EditorMode {
  if (!invoiceId || !storedStatus) return 'new';
  if (storedStatus === 'DRAFT') return 'draft';
  if (storedStatus === 'CANCELLED') return 'cancelled';
  return 'issued';
}
