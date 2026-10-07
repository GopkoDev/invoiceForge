import {
  InvoiceFormData,
  InvoiceFormItem,
  InvoiceSenderProfile,
  InvoiceCustomer,
  InvoiceBankAccount,
  InvoiceProduct,
  InvoiceCustomPrice,
  InvoiceLegacyInfo,
  InvoiceIssuedDetails,
  InvoiceStatus,
  Currency,
} from '@/types/invoice/types';

/**
 * invoice-integrity T16 (SCR-02): what the editor allows, from the invoice's stored status.
 * `new` and `draft` edit everything; `issued` (pending, overdue, paid) edits only the due date,
 * notes, payment terms and PO number; `cancelled` is read-only.
 */
export type EditorMode = 'new' | 'draft' | 'issued' | 'cancelled';

/** The pair a CONFLICT TOTALS_CHANGED carries (contracts/server-actions.md, AC-17): the SCR-15
 * dialog shows these, and a confirmed resubmit echoes them back as `confirmedTotals`. */
export interface TotalsChanged {
  oldTotal: string;
  newTotal: string;
}

/** The stored instants the editor was built from, as ISO strings (T44, I-01). */
export interface LoadedDates {
  issueDate: string;
  dueDate: string;
}

export interface NormalizedData {
  senderProfilesById: Map<string, InvoiceSenderProfile>;
  bankAccountsById: Map<string, InvoiceBankAccount>;
  customersById: Map<string, InvoiceCustomer>;
  productsById: Map<string, InvoiceProduct>;
  customPricesByProductId: Map<string, InvoiceCustomPrice[]>;
  customPricesByCustomerId: Map<string, InvoiceCustomPrice[]>;
  bankAccountsBySenderProfileId: Map<string, InvoiceBankAccount[]>;
}

export interface SenderProfileOption extends InvoiceSenderProfile {
  hasBankAccounts: boolean;
  bankAccountCount: number;
}

export interface ProductOption extends InvoiceProduct {
  customPrice?: number;
  hasCustomPrice: boolean;
}

export interface GroupedProducts {
  withCustomPrices: ProductOption[];
  regular: ProductOption[];
}

export interface ComputedValues {
  subtotal: number;
  taxAmount: number;
  total: number;
  selectedSenderProfile: InvoiceSenderProfile | undefined;
  selectedCustomer: InvoiceCustomer | undefined;
  selectedBankAccount: InvoiceBankAccount | undefined;
  invoiceCurrency: Currency;
  filteredProducts: InvoiceProduct[];
  groupedProducts: GroupedProducts;
  senderProfileOptions: SenderProfileOption[];
  availableBankAccounts: InvoiceBankAccount[];
}

export interface InvoiceEditorState extends NormalizedData, ComputedValues {
  formData: InvoiceFormData;
  senderProfiles: InvoiceSenderProfile[];
  bankAccounts: InvoiceBankAccount[];
  customers: InvoiceCustomer[];
  products: InvoiceProduct[];
  customPrices: InvoiceCustomPrice[];
  invoiceId?: string;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  /** The stored issue/due instants the editor was built from; a save sends them so the server can
   * tell an untouched legacy date from an edited one (T44, I-01). Null for a new invoice; after a save, the stored instants the row now holds. */
  loadedDates: LoadedDates | null;

  /** The hint from `generateInvoiceNumber`, shown only as a placeholder — never merged into
   * `formData.invoiceNumber` (AC-06, AC-11). */
  invoiceNumberHint?: string;
  /** VALIDATION / CONFLICT `fieldErrors` from the last save attempt, keyed by form path
   * (AC-08, AC-14, AC-15). */
  fieldErrors?: Record<string, string[]>;
  /** Set by a CONFLICT `details.kind === 'TOTALS_CHANGED'` so the header can open the SCR-15
   * confirmation dialog (AC-17). */
  totalsChanged: TotalsChanged | null;
  /** `legacy` flags from `getInvoiceEditorData`, carried in on `initialize` (AC-17). */
  legacy: InvoiceLegacyInfo | null;
  /** The invoice is stored PENDING but past its due date: the header badge reads Overdue while
   * `formData.status` keeps the stored status a save sends back (AC-24). */
  derivedOverdue: boolean;
  /** The status the invoice has in the database (at load, then after each save): the mode follows
   * it, not the status picked in the form (invoice-integrity T16). Null for a new invoice. */
  storedStatus: InvoiceStatus | null;
  /** The issued details shown as text once the invoice is issued (ADR-0001). */
  issuedDetails: InvoiceIssuedDetails | null;
  /** The `error` of the last save's ISSUED_INVOICE_LOCKED refusal; cleared when a save starts. */
  lockedRefusal: string | null;
  /** invoice-integrity T18 (ADR-0004): Invoice.version as loaded, then as returned by each save. */
  loadedVersion: number | null;
  /** The CHANGED_ELSEWHERE `error` of the last save: opens SCR-05. */
  changedElsewhere: string | null;
  /** SCR-05 closed without reloading: the stale Alert shows (SCR-02 stale). */
  stale: boolean;
  /** The last reload failed: the load error shows (SCR-17). */
  reloadFailed: boolean;

  initialize: (data: InvoiceEditorInitData) => void;
  updateField: <K extends keyof InvoiceFormData>(
    key: K,
    value: InvoiceFormData[K]
  ) => void;
  updateFields: (updates: Partial<InvoiceFormData>) => void;

  selectSenderProfile: (id: string) => Promise<void>;
  selectBankAccount: (id: string) => void;
  selectCustomer: (id: string) => void;

  addItem: () => void;
  addCustomItem: () => void;
  updateItem: (id: string, updates: Partial<InvoiceFormItem>) => void;
  deleteItem: (id: string) => void;
  duplicateItem: (id: string) => void;
  reorderItems: (oldIndex: number, newIndex: number) => void;

  setIsSaving: (isSaving: boolean) => void;
  markAsSaved: () => void;
  /** `issue`: Save and issue — the saved draft is sent with status PENDING (SCR-02). */
  saveInvoice: (options?: { confirmedTotals?: TotalsChanged; issue?: boolean }) => Promise<void>;
  clearTotalsChanged: () => void;
  /** SCR-05 closed: the editor turns stale, edits kept. */
  markStale: () => void;
  /** Re-fetches the editor data and re-initialises from the current invoice (SCR-05 Reload). */
  reloadInvoice: () => Promise<'reloaded' | 'not-found' | 'failed'>;
  reset: () => void;
}

export interface EntityMaps {
  senderProfile: InvoiceSenderProfile;
  bankAccount: InvoiceBankAccount;
  customer: InvoiceCustomer;
  product: InvoiceProduct;
}

export interface InvoiceEditorInitData {
  senderProfiles: InvoiceSenderProfile[];
  bankAccounts: InvoiceBankAccount[];
  customers: InvoiceCustomer[];
  products: InvoiceProduct[];
  customPrices: InvoiceCustomPrice[];
  initialData?: InvoiceFormData;
  derivedOverdue?: boolean;
  invoiceId?: string;
  legacy?: InvoiceLegacyInfo | null;
  version?: number;
  issuedDetails?: InvoiceIssuedDetails | null;
}

export interface RecalculateComputedValuesStateInput extends NormalizedData {
  formData: InvoiceFormData;
  senderProfiles: InvoiceSenderProfile[];
  bankAccounts: InvoiceBankAccount[];
  customers: InvoiceCustomer[];
  products: InvoiceProduct[];
  customPrices: InvoiceCustomPrice[];
  invoiceId?: string;
}
