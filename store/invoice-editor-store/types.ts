import {
  InvoiceFormData,
  InvoiceFormItem,
  InvoiceSenderProfile,
  InvoiceCustomer,
  InvoiceBankAccount,
  InvoiceProduct,
  InvoiceCustomPrice,
  Currency,
} from '@/types/invoice/types';

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

export interface InvalidItem {
  item: InvoiceFormItem;
  reason: 'currency' | 'customPrice';
}

export interface ComputedValues {
  subtotal: number;
  taxAmount: number;
  total: number;
  selectedSenderProfile: InvoiceSenderProfile | undefined;
  selectedCustomer: InvoiceCustomer | undefined;
  selectedBankAccount: InvoiceBankAccount | undefined;
  isEditingSentInvoice: boolean;
  invoiceCurrency: Currency;
  filteredProducts: InvoiceProduct[];
  groupedProducts: GroupedProducts;
  senderProfileOptions: SenderProfileOption[];
  availableBankAccounts: InvoiceBankAccount[];
  invalidItems: InvalidItem[];
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
  saveInvoice: () => Promise<void>;
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
  invoiceId?: string;
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
