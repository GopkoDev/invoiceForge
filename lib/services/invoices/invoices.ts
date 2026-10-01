import 'server-only';
import { z } from 'zod';
import { InvoiceStatus, type Prisma } from '@prisma/client';
import { prisma } from '@/prisma';
import { fail, ok, type ActionResult } from '@/types/result';
import type {
  InvoiceFilterOptions,
  InvoiceListItem,
  SerializedInvoice,
} from '@/types/invoice/types';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import {
  failed,
  zodValidationFailure,
} from '@/lib/services/_shared/result-helpers';
import {
  listQuerySchema,
  paginate,
  type Page,
} from '@/lib/services/_shared/list-query';
import { localDayRange } from '@/lib/services/_shared/time-zone';
import {
  computeInvoiceLegacyInfo,
  serializeDecimal,
  serializeInvoice,
} from '@/lib/actions/invoice-actions/helpers';
import { invoiceListSelect } from '@/lib/actions/invoice-actions/select-queries';
import { peekNextInvoiceNumber as peekNextNumber } from './numbering';

const PROFILE_NOT_FOUND = 'Sender profile not found.';

export async function getInvoice(
  actor: ActingFreelancer,
  id: string
): Promise<ActionResult<SerializedInvoice>> {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId: actor.userId } },
      include: {
        items: true,
        senderProfile: true,
        customer: true,
        bankAccount: true,
      },
    });
    if (!invoice) return fail('NOT_FOUND', 'Invoice not found.');

    const serialized = serializeInvoice(invoice);
    if (!serialized) {
      return failed(
        'Invoice serialize failed:',
        new Error(`Invoice ${id} could not be serialized`),
        'Failed to serialize invoice.'
      );
    }

    // AC-17's legacy flags (contracts/server-actions.md §getInvoiceEditorData / getInvoice).
    const legacy = await computeInvoiceLegacyInfo(prisma, invoice);
    return ok({ ...serialized, legacy });
  } catch (error) {
    return failed('Error fetching invoice:', error, 'Failed to fetch invoice.');
  }
}

/** The next proposed invoice number as a hint only (AC-06): no lock, no side effect. */
export async function peekNextInvoiceNumber(
  actor: ActingFreelancer,
  senderProfileId: string
): Promise<ActionResult<string>> {
  try {
    const profile = await prisma.senderProfile.findFirst({
      where: { id: senderProfileId, userId: actor.userId },
      select: { id: true },
    });
    if (!profile) return fail('NOT_FOUND', PROFILE_NOT_FOUND);

    const invoiceNumber = await peekNextNumber(senderProfileId);
    if (invoiceNumber === null) return fail('NOT_FOUND', PROFILE_NOT_FOUND);
    return ok(invoiceNumber);
  } catch (error) {
    return failed(
      'Error generating invoice number:',
      error,
      'Failed to generate invoice number.'
    );
  }
}

const DATE_MESSAGE =
  'Give both dates as YYYY-MM-DD, with the start on or before the end.';
const SORT_FIELDS = [
  'createdAt',
  'issueDate',
  'dueDate',
  'total',
  'invoiceNumber',
] as const;

const localDate = z.string({ message: DATE_MESSAGE }).refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}, DATE_MESSAGE);

export const invoiceListQuerySchema = listQuerySchema
  .extend({
    status: z
      .string({ message: 'Unknown status.' })
      .refine((value) => value === 'all' || value in InvoiceStatus, 'Unknown status.')
      .transform((value) => value as InvoiceStatus | 'all')
      .optional(),
    tab: z
      .enum(['all', 'drafts', 'final'], {
        message: 'Unknown tab. Allowed: all, drafts, final.',
      })
      .optional(),
    customerId: z.string().optional(),
    senderProfileId: z.string().optional(),
    dateFrom: localDate.optional(),
    dateTo: localDate.optional(),
    sortField: z
      .enum(SORT_FIELDS, {
        message: `Unknown sort option. Allowed: ${SORT_FIELDS.join(', ')}.`,
      })
      .optional(),
    sortDirection: z
      .enum(['asc', 'desc'], {
        message: 'Unknown sort direction. Allowed: asc, desc.',
      })
      .optional(),
  })
  .superRefine((query, ctx) => {
    const { dateFrom, dateTo } = query;
    if ((dateFrom === undefined) !== (dateTo === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [dateFrom === undefined ? 'dateTo' : 'dateFrom'],
        message: DATE_MESSAGE,
      });
    } else if (
      dateFrom !== undefined &&
      dateTo !== undefined &&
      dateFrom > dateTo
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateFrom'],
        message: DATE_MESSAGE,
      });
    }
  });

export type InvoiceListQuery = z.input<typeof invoiceListQuerySchema>;

export type InvoicePage = Page<InvoiceListItem> & {
  filterOptions: InvoiceFilterOptions;
  totalInvoices: number;
};

/** The invoices list: validated filters, local-date bounds in the actor's zone, owner-scoped (AC-26). */
export async function listInvoices(
  actor: ActingFreelancer,
  rawQuery: InvoiceListQuery = {}
): Promise<ActionResult<InvoicePage>> {
  const parsed = invoiceListQuerySchema.safeParse(rawQuery ?? {});
  if (!parsed.success)
    return zodValidationFailure(parsed.error, 'Invalid invoice list request.');
  const query = parsed.data;
  const {
    tab = 'all',
    status = 'all',
    sortField = 'createdAt',
    sortDirection = 'desc',
    search,
    customerId,
    senderProfileId,
    dateFrom,
    dateTo,
  } = query;

  try {
    const baseWhere: Prisma.InvoiceWhereInput = {
      senderProfile: { userId: actor.userId },
    };
    const where: Prisma.InvoiceWhereInput = { ...baseWhere };

    // The tab wins over the status filter, which applies on the all tab only (as the page does).
    if (tab === 'drafts') where.status = 'DRAFT';
    else if (tab === 'final') where.status = { not: 'DRAFT' };
    else if (status !== 'all') where.status = status;

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { senderName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (customerId) where.customerId = customerId;
    if (senderProfileId) where.senderProfileId = senderProfileId;
    if (dateFrom && dateTo) {
      const [gte, lt] = localDayRange(dateFrom, dateTo, actor.timeZone);
      where.issueDate = { gte, lt };
    }

    // The page is read first: a synchronous throw while building the sibling queries must not
    // orphan an in-flight page promise.
    const page = await paginate({
      count: () => prisma.invoice.count({ where }),
      findMany: (args) =>
        prisma.invoice.findMany({
          where,
          select: invoiceListSelect,
          ...args,
          orderBy: args.orderBy as Prisma.InvoiceOrderByWithRelationInput[],
        }),
      orderBy: [{ [sortField]: sortDirection }],
      query,
    });
    const [totalInvoices, customers, senderProfiles] = await Promise.all([
      prisma.invoice.count({ where: baseWhere }),
      prisma.customer.findMany({
        where: { userId: actor.userId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.senderProfile.findMany({
        where: { userId: actor.userId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return ok({
      ...page,
      items: page.items.map((inv) => ({
        ...inv,
        total: serializeDecimal(inv.total),
      })),
      filterOptions: { customers, senderProfiles },
      totalInvoices,
    });
  } catch (error) {
    return failed(
      'Error fetching invoices:',
      error,
      'Failed to fetch invoices.'
    );
  }
}
