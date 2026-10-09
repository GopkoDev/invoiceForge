import type {
  InvoiceBankAccount,
  InvoiceCustomer,
  InvoiceFormData,
  InvoiceSenderProfile,
  SerializedInvoice,
} from '@/types/invoice/types';

export interface InvoiceDocumentParties {
  senderProfile?: InvoiceSenderProfile | null;
  customer?: InvoiceCustomer | null;
  bankAccount?: InvoiceBankAccount | null;
}

export type InvoiceDocumentSource =
  | { kind: 'draft'; form: InvoiceFormData; parties: InvoiceDocumentParties }
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
