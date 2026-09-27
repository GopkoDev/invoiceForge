import { z } from 'zod';
import { InvoiceStatus } from '@prisma/client';
import type { InvoiceSortField, InvoiceTab, SortDirection } from '@/types/invoice/types';

// T23 (spec.md §5 AC-26, AC-27) — invoice-list link parameters are parsed with fallback-to-default
// schemas, so a malformed or tampered link never throws and always opens with a documented
// default, per docs/features/architecture-hardening/tasks/t23-invoice-list-link-params.md
// (Inlined context — contracts/server-actions.md §Link parameters, Invoice list, verbatim table;
// sad.md §8 Hard rule "Input validation").
//
// Every field is a `z.preprocess` (extract the raw searchParams value) piped into a small schema
// with `.catch(default)`, so a bad, missing, or tampered value never throws — it silently becomes
// its documented default, and the controls then show `applied` (AC-26).

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;
const SORT_FIELDS = [
  'createdAt',
  'issueDate',
  'dueDate',
  'total',
  'invoiceNumber',
] as const satisfies readonly InvoiceSortField[];
const SORT_DIRECTIONS = ['asc', 'desc'] as const satisfies readonly SortDirection[];
const TABS = ['all', 'drafts', 'final'] as const satisfies readonly InvoiceTab[];

const MAX_SEARCH_LENGTH = 100;

/** Next.js searchParams values are `string | string[] | undefined`; a repeated key takes the
 * first occurrence, and anything else (an unexpected shape) becomes undefined. */
function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

const pageSchema = z
  .preprocess((value) => {
    const raw = firstString(value);
    return raw === undefined ? NaN : Number(raw);
  }, z.number().int().min(1))
  .catch(1);

const pageSizeSchema = z
  .preprocess((value) => {
    const raw = firstString(value);
    return raw === undefined ? NaN : Number(raw);
  }, z.union([z.literal(PAGE_SIZE_OPTIONS[0]), z.literal(PAGE_SIZE_OPTIONS[1]), z.literal(PAGE_SIZE_OPTIONS[2]), z.literal(PAGE_SIZE_OPTIONS[3]), z.literal(PAGE_SIZE_OPTIONS[4])]))
  .catch(PAGE_SIZE_OPTIONS[0]);

const sortFieldSchema = z
  .preprocess((value) => firstString(value), z.enum(SORT_FIELDS))
  .catch('createdAt');

const sortDirectionSchema = z
  .preprocess((value) => firstString(value), z.enum(SORT_DIRECTIONS))
  .catch('desc');

const statusSchema = z
  .preprocess(
    (value) => firstString(value),
    z.union([z.literal('all'), z.nativeEnum(InvoiceStatus)])
  )
  .catch('all');

const tabSchema = z.preprocess((value) => firstString(value), z.enum(TABS)).catch('all');

const idSchema = z
  .preprocess((value) => firstString(value), z.string().min(1).optional())
  .catch(undefined);

const searchSchema = z
  .preprocess((value) => {
    const raw = firstString(value);
    return typeof raw === 'string' ? raw.trim().slice(0, MAX_SEARCH_LENGTH) : '';
  }, z.string())
  .catch('');

const dateSchema = z
  .preprocess((value) => firstString(value), z.string().optional())
  .catch(undefined);

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!isoDatePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const invoiceListParamsSchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    sortField: sortFieldSchema,
    sortDirection: sortDirectionSchema,
    status: statusSchema,
    tab: tabSchema,
    customerId: idSchema,
    senderProfileId: idSchema,
    search: searchSchema,
    dateFrom: dateSchema,
    dateTo: dateSchema,
  })
  .transform((parsed) => {
    const dateFrom =
      parsed.dateFrom !== undefined && isValidIsoDate(parsed.dateFrom)
        ? parsed.dateFrom
        : undefined;
    const dateTo =
      parsed.dateTo !== undefined && isValidIsoDate(parsed.dateTo) ? parsed.dateTo : undefined;

    // A reversed, partial, or otherwise unusable range: both bounds are dropped rather than
    // applying only one of them (task file §Inlined context, Link parameters table).
    const validRange = dateFrom !== undefined && dateTo !== undefined && dateFrom <= dateTo;

    return {
      ...parsed,
      dateFrom: validRange ? dateFrom : undefined,
      dateTo: validRange ? dateTo : undefined,
    };
  });

export type InvoiceListParams = {
  page: number;
  pageSize: (typeof PAGE_SIZE_OPTIONS)[number];
  sortField: InvoiceSortField;
  sortDirection: SortDirection;
  status: InvoiceStatus | 'all';
  tab: InvoiceTab;
  customerId?: string;
  senderProfileId?: string;
  search: string;
  dateFrom?: string;
  dateTo?: string;
};
