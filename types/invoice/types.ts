import { Prisma, Currency, InvoiceStatus } from '@prisma/client';

// Re-export Currency and InvoiceStatus for convenience
export { Currency, InvoiceStatus } from '@prisma/client';

// Full invoice with all relations
export type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: {
    items: true;
    senderProfile: true;
    customer: true;
    bankAccount: true;
  };
}>;

// Invoice list item type
export type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  total: number;
  currency: Currency;
  customerName: string;
  senderName: string;
  createdAt: Date;
  // T35 (AC-18, F-15): the moment the status became Paid; null otherwise.
  paidAt: Date | null;
};

// T14 (spec.md §5 AC-17) — legacy flags surfaced alongside a saved invoice
// (contracts/server-actions.md §getInvoiceEditorData / getInvoice, verbatim): null when nothing
// differs and the number is free.
export interface InvoiceLegacyInfo {
  storedTotal: string;
  recomputedTotal: string;
  sharedNumber: boolean;
}

// Serialized invoice for client components (Decimal converted to number)
export type SerializedInvoice = Omit<
  InvoiceWithRelations,
  | 'subtotal'
  | 'taxRate'
  | 'taxAmount'
  | 'discount'
  | 'shipping'
  | 'total'
  | 'amountPaid'
  | 'items'
> & {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  shipping: number;
  total: number;
  amountPaid: number;
  items: SerializedInvoiceItem[];
  legacy: InvoiceLegacyInfo | null;
};

export type SerializedInvoiceItem = {
  id: string;
  invoiceId: string;
  productId: string | null;
  name: string;
  description: string | null;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
};

// Invoice form item (for editor)
export interface InvoiceFormItem {
  id: string;
  productId: string;
  productName: string;
  description: string;
  unit: string;
  quantity: number;
  price: number;
  total: number;
}

// Invoice form data (for editor)
export interface InvoiceFormData {
  invoiceNumber: string;
  status: InvoiceStatus;
  senderProfileId: string;
  bankAccountId: string;
  customerId: string;
  issueDate: Date;
  dueDate: Date;
  currency: Currency;
  poNumber: string;
  paymentTerms: string;
  items: InvoiceFormItem[];
  taxRate: number;
  discount: number;
  shipping: number;
  notes: string;
  terms: string;
}

// Sender profile for invoice editor (simplified)
export interface InvoiceSenderProfile {
  id: string;
  name: string;
  legalName: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  logo: string | null;
  invoicePrefix: string;
  invoiceCounter: number;
}

// Bank account for invoice editor (simplified)
export interface InvoiceBankAccount {
  id: string;
  senderProfileId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban: string | null;
  swift: string | null;
  currency: Currency;
  isDefault: boolean;
}

// Customer for invoice editor (simplified)
export interface InvoiceCustomer {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  phone: string | null;
  taxId: string | null;
  defaultCurrency: Currency;
}

// Product for invoice editor (simplified)
export interface InvoiceProduct {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  price: number;
  currency: Currency;
  isActive: boolean;
}

// Custom price for invoice editor (simplified)
export interface InvoiceCustomPrice {
  id: string;
  productId: string;
  customerId: string;
  name: string | null;
  price: number;
}

// Data needed for the invoice editor
export interface InvoiceEditorData {
  senderProfiles: InvoiceSenderProfile[];
  bankAccounts: InvoiceBankAccount[];
  customers: InvoiceCustomer[];
  products: InvoiceProduct[];
  customPrices: InvoiceCustomPrice[];
  initialData?: InvoiceFormData;
  /** The stored status is PENDING but the due date has passed: the header badge reads Overdue (AC-24). */
  derivedOverdue?: boolean;
  invoiceId?: string;
  legacy?: InvoiceLegacyInfo | null;
}

// Status configuration for UI
export const invoiceStatusConfig: Record<
  InvoiceStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  PENDING: { label: 'Pending', variant: 'outline' },
  PAID: { label: 'Paid', variant: 'default' },
  CANCELLED: { label: 'Cancelled', variant: 'secondary' },
  // The services return the derived status (ADR-0005); screens only display it.
  OVERDUE: { label: 'Overdue', variant: 'destructive' },
};

// Invoice list tab type
export type InvoiceTab = 'all' | 'drafts' | 'final';

// Sort direction
export type SortDirection = 'asc' | 'desc';

// Sort field for invoices
export type InvoiceSortField =
  | 'createdAt'
  | 'issueDate'
  | 'dueDate'
  | 'total'
  | 'invoiceNumber';

// Invoice list search params
export interface InvoiceSearchParams {
  page?: string;
  pageSize?: string;
  tab?: InvoiceTab;
  search?: string;
  status?: InvoiceStatus | 'all';
  customerId?: string;
  senderProfileId?: string;
  // Support both naming conventions for sorting
  sortField?: InvoiceSortField;
  sortDirection?: SortDirection;
  sortBy?: string;
  sortOrder?: string;
  dateFrom?: string;
  dateTo?: string;
}

// Filter options for dropdowns
export interface InvoiceFilterOptions {
  customers: { id: string; name: string }[];
  senderProfiles: { id: string; name: string }[];
}

// Paginated invoice list response
export interface PaginatedInvoiceList {
  invoices: InvoiceListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filterOptions: InvoiceFilterOptions;
  totalInvoices: number; // Total invoices without any filters (for empty state detection)
}
