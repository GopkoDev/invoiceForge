// invoice-integrity T04 (spec.md §5 AC-08; ADR-0003) — what an issued invoice may not change. Every
// business column other than the due date, notes, payment terms and PO number is compared with the
// submitted value through the same normalizers the write uses: amounts as 2-dp strings (the shared
// decimal module), dates as calendar days (a legacy instant on the same day is unchanged, like
// keepUnchangedLegacyDay), lines in order, and the number by its normalized key. Pure and
// client-importable; updateInvoice (T08) turns a non-empty result into the VALIDATION refusal.

import { lineAmount, type DecimalString } from '@/lib/helpers/invoice-calculations';
import { utcDateToDay } from '@/lib/helpers/calendar-day';
import { normalizeInvoiceNumber } from '@/lib/helpers/invoice-number-key';

export const ISSUED_INVOICE_LOCKED_MESSAGE =
  'An issued invoice can only change its due date, notes, payment terms and PO number. To correct anything else, cancel it and duplicate it.';
export const LOCKED_FIELD_MESSAGE = "This field can't change on an issued invoice.";

/** A stored Decimal column (Prisma Decimal, or its string form). */
type StoredDecimal = { toString(): string } | string | number;

export interface LockedFieldsStored {
  invoiceNumberKey: string;
  senderProfileId: string;
  customerId: string;
  bankAccountId: string;
  issueDate: Date;
  currency: string;
  taxRate: StoredDecimal;
  discount: StoredDecimal;
  shipping: StoredDecimal;
  terms: string | null;
  items: Array<{
    productId: string | null;
    name: string;
    description: string | null;
    unit: string;
    quantity: StoredDecimal;
    rate: StoredDecimal;
  }>;
}

export interface LockedFieldsSubmitted {
  invoiceNumber: string;
  senderProfileId: string;
  customerId: string;
  bankAccountId: string;
  issueDate: Date;
  currency: string;
  taxRate: number;
  discount: number;
  shipping: number;
  terms: string;
  items: Array<{
    productId?: string;
    productName: string;
    description: string;
    unit: string;
    quantity: number;
    price: number;
  }>;
}

/** 2-dp string, rounded the way the write rounds (the shared decimal module). */
function cents(value: StoredDecimal): DecimalString {
  return lineAmount(value.toString(), 1);
}

/** The line as the write stores it ('custom' / empty product → null, empty description → null). */
type Line = Record<'productId' | 'productName' | 'description' | 'unit' | 'quantity' | 'price', string>;

function storedLine(item: LockedFieldsStored['items'][number]): Line {
  return {
    productId: item.productId ?? '',
    productName: item.name,
    description: item.description ?? '',
    unit: item.unit,
    quantity: cents(item.quantity),
    price: cents(item.rate),
  };
}

function submittedLine(item: LockedFieldsSubmitted['items'][number]): Line {
  return {
    productId: item.productId && item.productId !== 'custom' ? item.productId : '',
    productName: item.productName,
    description: item.description || '',
    unit: item.unit,
    quantity: cents(item.quantity),
    price: cents(item.price),
  };
}

const sameMultiset = (a: Line[], b: Line[]) => {
  const key = (lines: Line[]) => lines.map((line) => JSON.stringify(line)).sort().join('\n');
  return key(a) === key(b);
};

/**
 * Returns one fieldErrors entry per changed locked key (empty when nothing locked changed):
 * `items` when lines were added, removed or reordered, else `items.<i>.<field>` per changed field.
 */
export function compareLockedFields(
  stored: LockedFieldsStored,
  submitted: LockedFieldsSubmitted
): Record<string, string[]> {
  const changed: string[] = [];
  const differs = (key: string, a: string, b: string) => {
    if (a !== b) changed.push(key);
  };

  differs('invoiceNumber', stored.invoiceNumberKey, normalizeInvoiceNumber(submitted.invoiceNumber));
  differs('senderProfileId', stored.senderProfileId, submitted.senderProfileId);
  differs('customerId', stored.customerId, submitted.customerId);
  differs('bankAccountId', stored.bankAccountId, submitted.bankAccountId);
  differs('issueDate', utcDateToDay(stored.issueDate), utcDateToDay(submitted.issueDate));
  differs('currency', stored.currency, submitted.currency);
  differs('taxRate', cents(stored.taxRate), cents(submitted.taxRate));
  differs('discount', cents(stored.discount), cents(submitted.discount));
  differs('shipping', cents(stored.shipping), cents(submitted.shipping));
  differs('terms', stored.terms ?? '', submitted.terms);

  const before = stored.items.map(storedLine);
  const after = submitted.items.map(submittedLine);
  if (before.length !== after.length) {
    changed.push('items');
  } else {
    const lineChanges = before.flatMap((line, i) =>
      (Object.keys(line) as Array<keyof Line>)
        .filter((field) => line[field] !== after[i][field])
        .map((field) => `items.${i}.${field}`)
    );
    if (lineChanges.length > 0) {
      changed.push(...(sameMultiset(before, after) ? ['items'] : lineChanges));
    }
  }

  return Object.fromEntries(changed.map((key) => [key, [LOCKED_FIELD_MESSAGE]]));
}
