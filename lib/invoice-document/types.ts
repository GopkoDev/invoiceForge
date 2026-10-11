import type {
  InvoiceBankAccount,
  InvoiceCustomer,
  InvoiceFormData,
  InvoiceSenderProfile,
  SerializedInvoice,
  StoredAmounts,
} from '@/types/invoice/types';

export type { StoredAmounts };

export interface InvoiceDocumentParties {
  senderProfile?: InvoiceSenderProfile | null;
  customer?: InvoiceCustomer | null;
  bankAccount?: InvoiceBankAccount | null;
}

export type InvoiceDocumentSource =
  | {
      kind: 'draft';
      form: InvoiceFormData;
      parties: InvoiceDocumentParties;
      /** An issued invoice opened in the editor: print these stored figures and the lines' stored
       * `total`s instead of recomputing (AC-10, ADR-0002). Omitted for a draft or a new invoice. */
      storedAmounts?: StoredAmounts;
    }
  | { kind: 'issued'; invoice: SerializedInvoice };

export interface InvoiceDocumentRow {
  label: string;
  value: string;
}

export interface InvoiceDocumentBlock {
  title: string;
  lines: string[];
}

export interface InvoiceDocumentLine {
  name: string;
  description: string | null;
  price: string;
  quantity: string;
  amount: string;
}

export interface InvoiceDocument {
  title: string;
  invoiceNumber: string;
  meta: InvoiceDocumentRow[];
  from: InvoiceDocumentBlock;
  to: InvoiceDocumentBlock;
  columns: { product: string; price: string; quantity: string; amount: string };
  lines: InvoiceDocumentLine[];
  summary: InvoiceDocumentRow[];
  total: InvoiceDocumentRow;
  notes: { title: string; text: string } | null;
  terms: { title: string; text: string } | null;
  bank: InvoiceDocumentBlock | null;
}
