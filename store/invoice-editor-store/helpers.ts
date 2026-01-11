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
  NormalizedData,
  ComputedValues,
  SenderProfileOption,
  ProductOption,
  GroupedProducts,
  InvalidItem,
  RecalculateComputedValuesStateInput,
} from './types';
import { getValidItems } from '@/lib/helpers/invoice-editor';
import { v4 as uuidv4 } from 'uuid';
import {
  calculateSubtotal,
  calculateTaxAmount,
  calculateTotal,
} from '@/lib/helpers/invoice-calculations';

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
// Invalid items detection
// ============================================

function _findInvalidItems(
  items: InvoiceFormItem[],
  productsById: Map<string, InvoiceProduct>,
  customPricesByProductId: Map<string, InvoiceCustomPrice[]>,
  invoiceCurrency: Currency,
  customerId: string
): InvalidItem[] {
  const invalidItems: InvalidItem[] = [];

  for (const item of items) {
    // Skip custom items (productId === 'custom')
    if (item.productId === 'custom' || !item.productId) {
      continue;
    }

    const product = productsById.get(item.productId);

    // If product doesn't exist or has wrong currency
    if (!product) {
      invalidItems.push({ item, reason: 'currency' });
      continue;
    }

    if (product.currency !== invoiceCurrency) {
      invalidItems.push({ item, reason: 'currency' });
      continue;
    }

    // Check if item was using a custom price that's no longer valid
    const customPrices = customPricesByProductId.get(item.productId) || [];
    const hasCustomPriceForCustomer = customPrices.some(
      (cp) => cp.customerId === customerId
    );

    // If item has a price different from product price and there's no custom price for this customer
    if (item.price !== product.price && !hasCustomPriceForCustomer) {
      // This item might have been using a custom price from a different customer
      const anyCustomPrice = customPrices.find((cp) => cp.price === item.price);
      if (anyCustomPrice && anyCustomPrice.customerId !== customerId) {
        invalidItems.push({ item, reason: 'customPrice' });
      }
    }
  }

  return invalidItems;
}

// ============================================
// State check functions
// ============================================

function _checkIsEditingSentInvoice(
  invoiceId: string | undefined,
  status: InvoiceStatus
): boolean {
  return !!invoiceId && ['PENDING', 'PAID', 'OVERDUE'].includes(status);
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

  // Find invalid items (wrong currency or invalid custom prices)
  const invalidItems = _findInvalidItems(
    state.formData.items,
    state.productsById,
    state.customPricesByProductId,
    invoiceCurrency,
    state.formData.customerId
  );

  // Calculate totals only for valid items
  const validItems = getValidItems(state.formData.items, invalidItems);
  const subtotal = calculateSubtotal(validItems);
  const taxAmount = calculateTaxAmount(
    subtotal,
    state.formData.discount,
    state.formData.shipping,
    state.formData.taxRate
  );
  const total = calculateTotal(
    subtotal,
    taxAmount,
    state.formData.discount,
    state.formData.shipping
  );

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
    isEditingSentInvoice: _checkIsEditingSentInvoice(
      state.invoiceId,
      state.formData.status
    ),
    invoiceCurrency,
    filteredProducts,
    groupedProducts,
    senderProfileOptions,
    availableBankAccounts,
    invalidItems,
  };
}

// ============================================
// Initial form data
// ============================================

export function createInitialFormData(): InvoiceFormData {
  return {
    invoiceNumber: '',
    status: 'DRAFT' as InvoiceStatus,
    senderProfileId: '',
    bankAccountId: '',
    customerId: '',
    issueDate: new Date(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
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
    isEditingSentInvoice: false,
    invoiceCurrency: 'USD' as const,
    filteredProducts: [],
    groupedProducts: { withCustomPrices: [], regular: [] },
    senderProfileOptions: [],
    availableBankAccounts: [],
    invalidItems: [],
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
