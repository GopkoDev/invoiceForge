import 'server-only';
import { z } from 'zod';
import type { Currency, InvoiceStatus, Prisma } from '@prisma/client';
import { prisma } from '@/prisma';
import { fail, ok, type ActionFailure, type ActionResult, type DecimalString } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { escapeLike } from '@/lib/services/_shared/list-query';
import {
  daysOverdue,
  derivedStatus,
  overdueWhere,
  statusFilterWhere,
  todayIn,
  type DerivedInvoiceStatus,
  type LocalDate,
} from '@/lib/services/_shared/overdue';
import { failed, zodValidationFailure } from '@/lib/services/_shared/result-helpers';
import {
  isPageOutOfRange,
  pageOutOfRange,
  strictPage,
  strictPageInfo,
  type StrictPageInfo,
} from '@/lib/services/_shared/strict-page';
import { addDaysToDay, dayToUtcDate, utcDateToDay } from '@/lib/helpers/calendar-day';
import { normalizeInvoiceNumber } from '@/lib/services/invoices/numbering';
import { resolveCustomerByName } from '@/lib/services/customers/customers';
import { resolveSenderProfileByName } from '@/lib/services/sender-profiles/resolve-by-name';

// T16 (AC-08, AC-17, AC-21): the Assistant invoice search. Names resolve to one owned record first
// (none -> NOT_FOUND, identical to a missing one; several -> AMBIGUOUS_REFERENCE); the search then
// runs on ids, scoped by the owner in its own where. Notes and lines are never searched.

const MAX_INT = 2 ** 31 - 1;
const DISPLAY_STATUSES = ['draft', 'pending', 'overdue', 'paid', 'cancelled'] as const;
const ISSUED_STATUSES: DerivedInvoiceStatus[] = ['pending', 'overdue', 'paid'];

const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date as yyyy-MM-dd.')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Not a real calendar date.');
const text = z.string().trim().min(1).max(100);
const recordId = z.string().min(1).max(100);

const searchInput = z
  .object({
    page: z.number().int().min(1).max(MAX_INT).optional(),
    pageSize: z.number().int().min(1).max(MAX_INT).optional(),
    customerId: recordId.optional(),
    customer: text.optional(),
    senderProfileId: recordId.optional(),
    senderProfile: text.optional(),
    status: z.array(z.enum(DISPLAY_STATUSES)).min(1).optional(),
    invoiceNumber: text.optional(),
    issueDateFrom: localDate.optional(),
    issueDateTo: localDate.optional(),
    dueDateFrom: localDate.optional(),
    dueDateTo: localDate.optional(),
  })
  .superRefine((v, ctx) => {
    const bad = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.customerId !== undefined && v.customer !== undefined) bad('customer', 'Give the Customer by id or by name, not both.');
    if (v.senderProfileId !== undefined && v.senderProfile !== undefined) {
      bad('senderProfile', 'Give the sender profile by id or by name, not both.');
    }
    if (v.issueDateFrom && v.issueDateTo && v.issueDateFrom > v.issueDateTo) bad('issueDateTo', 'The end is before the start.');
    if (v.dueDateFrom && v.dueDateTo && v.dueDateFrom > v.dueDateTo) bad('dueDateTo', 'The end is before the start.');
  });

export type SearchInvoicesInput = z.input<typeof searchInput>;

export type CurrencyTotal = { currency: Currency; total: DecimalString; count: number };

export type InvoiceRow = {
  invoiceId: string;
  invoiceNumber: string;
  senderProfile: { senderProfileId: string; name: string };
  customer: { customerId: string; name: string };
  status: DerivedInvoiceStatus;
  amount: DecimalString;
  currency: Currency;
  dueDate: LocalDate;
  daysOverdue: number | null;
};

export type InvoiceSearchAnswer = {
  today: LocalDate;
  timeZone: string;
  rows: InvoiceRow[];
  totals: CurrencyTotal[];
  pageInfo: StrictPageInfo;
};

const NO_CUSTOMER = 'Customer not found.';
const NO_SENDER_PROFILE = 'Sender profile not found.';

function ambiguous(
  reference: 'customer' | 'senderProfile',
  candidates: { id: string; name: string; detail?: string }[],
): ActionFailure {
  const label = reference === 'customer' ? 'Customers' : 'sender profiles';
  return fail('VALIDATION', `Several ${label} match that name; say which one is meant.`, {
    details: { kind: 'AMBIGUOUS_REFERENCE', reference, candidates },
  });
}

/** Display status -> where. Stored draft/paid/cancelled filter directly; pending and overdue follow the rule. */
function statusWhere(status: DerivedInvoiceStatus, today: LocalDate): Prisma.InvoiceWhereInput {
  if (status === 'overdue') return overdueWhere(today);
  return statusFilterWhere(status.toUpperCase() as InvoiceStatus, today);
}

export async function searchInvoicesForAssistant(
  actor: ActingFreelancer,
  input: SearchInvoicesInput = {},
): Promise<ActionResult<InvoiceSearchAnswer>> {
  const parsed = searchInput.safeParse(input ?? {});
  if (!parsed.success) return zodValidationFailure(parsed.error, 'Invalid search request.');
  const q = parsed.data;
  try {
    // 1. Resolve the Customer and the sender profile to one owned record each.
    let customerId = q.customerId;
    if (customerId !== undefined) {
      const own = await prisma.customer.findFirst({ where: { id: customerId, userId: actor.userId }, select: { id: true } });
      if (!own) return fail('NOT_FOUND', NO_CUSTOMER);
    } else if (q.customer !== undefined) {
      const match = await resolveCustomerByName(actor, q.customer);
      if (!match.success) return match;
      if (match.data.kind === 'none') return fail('NOT_FOUND', NO_CUSTOMER);
      if (match.data.kind === 'candidates') return ambiguous('customer', match.data.candidates);
      customerId = match.data.customerId;
    }
    let senderProfileId = q.senderProfileId;
    if (senderProfileId !== undefined) {
      const own = await prisma.senderProfile.findFirst({
        where: { id: senderProfileId, userId: actor.userId },
        select: { id: true },
      });
      if (!own) return fail('NOT_FOUND', NO_SENDER_PROFILE);
    } else if (q.senderProfile !== undefined) {
      const match = await resolveSenderProfileByName(actor, q.senderProfile);
      if (!match.success) return match;
      if (match.data.kind === 'none') return fail('NOT_FOUND', NO_SENDER_PROFILE);
      if (match.data.kind === 'candidates') return ambiguous('senderProfile', match.data.candidates);
      senderProfileId = match.data.senderProfileId;
    }

    // 2. The where over this Freelancer's invoices.
    const today = todayIn(actor.timeZone);
    const statuses = q.status ?? ISSUED_STATUSES;
    const and: Prisma.InvoiceWhereInput[] = [{ OR: statuses.map((s) => statusWhere(s, today)) }];
    if (customerId) and.push({ customerId });
    if (senderProfileId) and.push({ senderProfileId });
    if (q.invoiceNumber) {
      and.push({ invoiceNumberKey: { contains: escapeLike(normalizeInvoiceNumber(q.invoiceNumber)) } });
    }
    // Issue and due dates are stored calendar days (T25): each bound compares by day, in no zone.
    if (q.issueDateFrom) and.push({ issueDate: { gte: dayToUtcDate(q.issueDateFrom) } });
    if (q.issueDateTo) and.push({ issueDate: { lt: dayToUtcDate(addDaysToDay(q.issueDateTo, 1)) } });
    if (q.dueDateFrom) and.push({ dueDate: { gte: dayToUtcDate(q.dueDateFrom) } });
    if (q.dueDateTo) and.push({ dueDate: { lt: dayToUtcDate(addDaysToDay(q.dueDateTo, 1)) } });
    const where: Prisma.InvoiceWhereInput = { senderProfile: { userId: actor.userId }, AND: and };

    // 3. Totals over every match, then one strict page.
    const plan = strictPage(q);
    const groups = await prisma.invoice.groupBy({
      by: ['currency'],
      where,
      _sum: { total: true },
      _count: { _all: true },
      orderBy: { currency: 'asc' },
    });
    const total = groups.reduce((n, g) => n + g._count._all, 0);
    if (isPageOutOfRange(plan.page, total, plan.pageSize)) return pageOutOfRange(total, plan.pageSize);
    const rows =
      total === 0
        ? []
        : await prisma.invoice.findMany({
            where,
            select: {
              id: true,
              invoiceNumber: true,
              senderProfileId: true,
              senderName: true,
              customerId: true,
              customerName: true,
              status: true,
              total: true,
              currency: true,
              dueDate: true,
            },
            orderBy: [{ issueDate: 'desc' }, { invoiceNumber: 'asc' }, { id: 'asc' }],
            skip: plan.offset,
            take: plan.limit,
          });

    return ok({
      today,
      timeZone: actor.timeZone,
      rows: rows.map((r): InvoiceRow => {
        const status = derivedStatus(r, today);
        return {
          invoiceId: r.id,
          invoiceNumber: r.invoiceNumber,
          senderProfile: { senderProfileId: r.senderProfileId, name: r.senderName },
          customer: { customerId: r.customerId, name: r.customerName },
          status,
          amount: r.total.toFixed(2),
          currency: r.currency,
          dueDate: utcDateToDay(r.dueDate),
          daysOverdue: status === 'overdue' ? daysOverdue(r.dueDate, today) : null,
        };
      }),
      totals: groups
        .map((g) => ({
          currency: g.currency,
          total: g._sum.total?.toFixed(2) ?? '0.00',
          count: g._count._all,
        }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
      pageInfo: strictPageInfo(plan, total),
    });
  } catch (error) {
    return failed('Error searching invoices for the Assistant:', error, 'Failed to search invoices.');
  }
}
