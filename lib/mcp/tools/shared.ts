import 'server-only';
import { z } from 'zod';
import { Currency } from '@prisma/client';
import { freelancerText } from '@/lib/mcp/answers';

// Zod shapes shared by the aggregate tools; they mirror contracts/openapi.yaml components.schemas.

const currency = z.nativeEnum(Currency);
const decimal = z.string().describe('Exact amount with two decimals, never converted between currencies.');
const localDate = z.string().describe('A calendar day YYYY-MM-DD.');
const freelancerTextSchema = z.object({ freelancerText: z.string() });

export const pageInputShape = {
  page: z.number().int().min(1).optional().describe('Page number, from 1. Default 1.'),
  pageSize: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Rows per page. Default 20; a value above 50 is capped at 50.'),
  currency: currency.optional().describe('Only this currency. Absent = every currency.'),
};

/**
 * Loose on purpose: the exact preset / range / 5-year rule is enforced by the service so a bad
 * period is refused with the AC-16 message rather than a generic argument error.
 */
export const periodInput = z
  .object({
    preset: z
      .string()
      .optional()
      .describe('One of this-month, last-month, this-year, last-year, all-time.'),
    from: z.string().optional().describe('First day YYYY-MM-DD; use with `to`.'),
    to: z.string().optional().describe('Last day YYYY-MM-DD; use with `from`. At most 5 years.'),
  })
  .describe('A named preset, or a from-to range of at most 5 years whose start is not after its end.');

export const timeZoneName = z.string().describe('The Freelancer time zone used for today and period bounds.');

export const pageInfoSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  pageSizeCapped: z.boolean(),
  total: z.number().int(),
  totalPages: z.number().int(),
  hasMore: z.boolean().describe('true means later pages exist: the answer is not complete.'),
});

export const currencyTotalSchema = z.object({ currency, total: decimal, count: z.number().int() });

export const appliedPeriodSchema = z.object({
  preset: z.string().nullable(),
  from: localDate.nullable(),
  to: localDate.nullable(),
});

export const invoiceRowSchema = z.object({
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  senderProfile: z.object({ senderProfileId: z.string(), name: freelancerTextSchema }),
  customer: z.object({ customerId: z.string(), name: freelancerTextSchema }),
  status: z.enum(['overdue', 'pending']),
  amount: decimal,
  currency,
  dueDate: localDate,
  daysOverdue: z.number().int().min(0).nullable(),
});

export const outputBase = {
  today: localDate,
  timeZone: timeZoneName,
};

type Named = { name: string };

/** Wraps the Freelancer-typed names of an invoice row (AC-19b). */
export function wrapInvoiceRow<
  R extends { senderProfile: Named & Record<string, unknown>; customer: Named & Record<string, unknown> },
>(row: R) {
  return {
    ...row,
    senderProfile: { ...row.senderProfile, name: freelancerText(row.senderProfile.name) },
    customer: { ...row.customer, name: freelancerText(row.customer.name) },
  };
}
