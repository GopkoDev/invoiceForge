// ai-chat-v2 T51 (ADR-0011; spec §1 F2; screens.md SCR-04 revision): a Question form question's heading is app text
// fixed per field ("Customer", "Line 1 · Price", "Issue date", …), never model text. Pure; the browser reads it
// from the FormView.
import 'server-only';
import type { FormField } from '@/types/assistant/types';

const FIELD_HEADING: Record<FormField, string> = {
  CUSTOMER: 'Customer',
  SENDER_PROFILE: 'Sender profile',
  BANK_ACCOUNT: 'Bank account',
  CURRENCY: 'Currency',
  PRODUCT: 'Product',
  ISSUE_DATE: 'Issue date',
  DUE_DATE: 'Due date',
  QUANTITY: 'Quantity',
  PRICE: 'Price',
  TAX_RATE: 'Tax rate',
  DISCOUNT: 'Discount',
  PO_NUMBER: 'PO number',
  PAYMENT_TERMS: 'Payment terms',
  NOTES: 'Notes',
  FREE: 'Question',
};

/** The fields that fill one invoice line; their heading names the line ("Line 1 · Price"). */
export const LINE_FIELDS: ReadonlySet<FormField> = new Set<FormField>(['PRODUCT', 'QUANTITY', 'PRICE']);

export function formHeading(field: FormField, lineIndex: number | null): string {
  const heading = FIELD_HEADING[field];
  return LINE_FIELDS.has(field) && lineIndex !== null ? `Line ${lineIndex + 1} · ${heading}` : heading;
}
