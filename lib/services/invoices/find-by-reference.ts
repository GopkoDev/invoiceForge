import 'server-only';
import { z } from 'zod';
import type { Currency, Prisma } from '@prisma/client';
import { prisma } from '@/prisma';
import { fail, ok, type ActionResult, type DecimalString } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import {
  daysOverdue,
  derivedStatus,
  todayIn,
  type DerivedInvoiceStatus,
  type LocalDate,
} from '@/lib/services/_shared/overdue';
import { failed, zodValidationFailure } from '@/lib/services/_shared/result-helpers';
import { normalizeInvoiceNumber } from '@/lib/services/invoices/numbering';
import { utcDateToDay } from '@/lib/helpers/calendar-day';
import { resolveSenderProfileByName } from '@/lib/services/sender-profiles/resolve-by-name';

// T17 (AC-08, AC-19, AC-20): one invoice by record id, or by whole invoice number with an optional
// sender profile name. Every read is scoped by the owner in its own where, so another Freelancer's
// invoice is answered exactly like a missing one. The bank snapshot columns are never selected.

const MAX_CANDIDATES = 50;
const NO_INVOICE = 'No invoice matches that reference. Check the number or ask the Freelancer for it.';

const text = z.string().trim().min(1).max(100);

const findInput = z
  .object({
    invoiceId: z.string().min(1).max(100).optional(),
    invoiceNumber: text.optional(),
    senderProfile: text.optional(),
  })
  .superRefine((v, ctx) => {
    const bad = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.invoiceId === undefined && v.invoiceNumber === undefined) {
      bad('invoiceId', 'Give the invoice by its id or by its number.');
    }
    if (v.invoiceId !== undefined && v.invoiceNumber !== undefined) {
      bad('invoiceNumber', 'Give the invoice by id or by number, not both.');
    }
    if (v.invoiceId !== undefined && v.senderProfile !== undefined) {
      bad('senderProfile', 'A sender profile name goes with an invoice number, not an id.');
    }
  });

export type FindInvoiceInput = z.input<typeof findInput>;

export type InvoiceAnswer = {
  invoiceId: string;
  invoiceNumber: string;
  status: DerivedInvoiceStatus;
  daysOverdue: number | null;
  issueDate: LocalDate;
  dueDate: LocalDate;
  currency: Currency;
  sender: {
    senderProfileId: string;
    name: string;
    legalName: string | null;
    taxId: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    postalCode: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
  };
  customer: {
    customerId: string;
    name: string;
    companyName: string | null;
    taxId: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    postalCode: string | null;
  };
  lines: {
    name: string;
    description: string | null;
    unit: string;
    quantity: DecimalString;
    rate: DecimalString;
    amount: DecimalString;
  }[];
  amounts: {
    subtotal: DecimalString;
    taxRate: DecimalString;
    taxAmount: DecimalString;
    discount: DecimalString;
    shipping: DecimalString;
    total: DecimalString;
    amountPaid: DecimalString;
  };
  paymentTerms: string | null;
  terms: string | null;
  notes: string | null;
  poNumber: string | null;
};

// Copied sender / customer details, lines and amounts. No bank* / accountName column appears here.
const answerSelect = {
  id: true,
  invoiceNumber: true,
  status: true,
  issueDate: true,
  dueDate: true,
  currency: true,
  senderProfileId: true,
  senderName: true,
  senderLegalName: true,
  senderTaxId: true,
  senderAddress: true,
  senderCity: true,
  senderCountry: true,
  senderPostalCode: true,
  senderPhone: true,
  senderEmail: true,
  senderWebsite: true,
  customerId: true,
  customerName: true,
  customerCompanyName: true,
  customerTaxId: true,
  customerEmail: true,
  customerPhone: true,
  customerAddress: true,
  customerCity: true,
  customerCountry: true,
  customerPostalCode: true,
  subtotal: true,
  taxRate: true,
  taxAmount: true,
  discount: true,
  shipping: true,
  total: true,
  amountPaid: true,
  paymentTerms: true,
  terms: true,
  notes: true,
  poNumber: true,
  items: {
    select: { name: true, description: true, unit: true, quantity: true, rate: true, amount: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.InvoiceSelect;

type Row = Prisma.InvoiceGetPayload<{ select: typeof answerSelect }>;

const day = (d: Date): LocalDate => utcDateToDay(d);

function toAnswer(r: Row, timeZone: string): InvoiceAnswer {
  const today = todayIn(timeZone);
  const status = derivedStatus(r, today);
  return {
    invoiceId: r.id,
    invoiceNumber: r.invoiceNumber,
    status,
    daysOverdue: status === 'overdue' ? daysOverdue(r.dueDate, today) : null,
    issueDate: day(r.issueDate),
    dueDate: day(r.dueDate),
    currency: r.currency,
    sender: {
      senderProfileId: r.senderProfileId,
      name: r.senderName,
      legalName: r.senderLegalName,
      taxId: r.senderTaxId,
      address: r.senderAddress,
      city: r.senderCity,
      country: r.senderCountry,
      postalCode: r.senderPostalCode,
      phone: r.senderPhone,
      email: r.senderEmail,
      website: r.senderWebsite,
    },
    customer: {
      customerId: r.customerId,
      name: r.customerName,
      companyName: r.customerCompanyName,
      taxId: r.customerTaxId,
      email: r.customerEmail,
      phone: r.customerPhone,
      address: r.customerAddress,
      city: r.customerCity,
      country: r.customerCountry,
      postalCode: r.customerPostalCode,
    },
    lines: r.items.map((i) => ({
      name: i.name,
      description: i.description,
      unit: i.unit,
      quantity: i.quantity.toFixed(2),
      rate: i.rate.toFixed(2),
      amount: i.amount.toFixed(2),
    })),
    amounts: {
      subtotal: r.subtotal.toFixed(2),
      taxRate: r.taxRate.toFixed(2),
      taxAmount: r.taxAmount.toFixed(2),
      discount: r.discount.toFixed(2),
      shipping: r.shipping.toFixed(2),
      total: r.total.toFixed(2),
      amountPaid: r.amountPaid.toFixed(2),
    },
    paymentTerms: r.paymentTerms,
    terms: r.terms,
    notes: r.notes,
    poNumber: r.poNumber,
  };
}

export async function findInvoiceByReference(
  actor: ActingFreelancer,
  input: FindInvoiceInput,
): Promise<ActionResult<InvoiceAnswer>> {
  const parsed = findInput.safeParse(input ?? {});
  if (!parsed.success) return zodValidationFailure(parsed.error, 'Invalid invoice reference.');
  const q = parsed.data;
  try {
    const owner: Prisma.InvoiceWhereInput = { senderProfile: { userId: actor.userId } };

    if (q.invoiceId !== undefined) {
      const row = await prisma.invoice.findFirst({ where: { id: q.invoiceId, ...owner }, select: answerSelect });
      return row ? ok(toAnswer(row, actor.timeZone)) : fail('NOT_FOUND', NO_INVOICE);
    }

    // By number: within the named sender profile, or across all of the Freelancer's.
    let senderProfileId: string | undefined;
    if (q.senderProfile !== undefined) {
      const match = await resolveSenderProfileByName(actor, q.senderProfile);
      if (!match.success) return match;
      if (match.data.kind === 'none') return fail('NOT_FOUND', NO_INVOICE);
      if (match.data.kind === 'candidates') {
        return fail('VALIDATION', 'Several sender profiles match that name; say which one is meant.', {
          details: { kind: 'AMBIGUOUS_REFERENCE', reference: 'senderProfile', candidates: match.data.candidates },
        });
      }
      senderProfileId = match.data.senderProfileId;
    }

    const rows = await prisma.invoice.findMany({
      where: {
        ...owner,
        invoiceNumberKey: normalizeInvoiceNumber(q.invoiceNumber!),
        ...(senderProfileId ? { senderProfileId } : {}),
      },
      select: answerSelect,
      orderBy: [{ issueDate: 'desc' }, { id: 'asc' }],
      take: MAX_CANDIDATES,
    });
    if (rows.length === 0) return fail('NOT_FOUND', NO_INVOICE);
    if (rows.length === 1) return ok(toAnswer(rows[0], actor.timeZone));
    return fail('VALIDATION', 'Several invoices have that number; say which sender profile is meant.', {
      details: {
        kind: 'AMBIGUOUS_REFERENCE',
        reference: 'invoice',
        candidates: rows.map((r) => ({
          id: r.id,
          name: r.invoiceNumber,
          detail: `${r.senderName} · ${r.customerName} · ${day(r.issueDate)}`,
          senderProfile: { senderProfileId: r.senderProfileId, name: r.senderName },
          customer: { customerId: r.customerId, name: r.customerName },
          issueDate: day(r.issueDate),
        })),
      },
    });
  } catch (error) {
    return failed('Error finding an invoice by reference:', error, 'Failed to fetch the invoice.');
  }
}
