import { z } from 'zod';
import { InvoiceStatus } from '@prisma/client';
import type {
  InvoiceSortField,
  InvoiceTab,
  SortDirection,
} from '@/types/invoice/types';
import {
  isWithinMaxCustomPeriod,
  presetPeriodDays,
  type PresetPeriodName,
} from '@/lib/validations/dashboard-period';
import {
  currentLocalMonth,
  formatLocalDateKey,
  localDayRange,
} from '@/lib/helpers/time-zone';

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
const SORT_DIRECTIONS = [
  'asc',
  'desc',
] as const satisfies readonly SortDirection[];
const TABS = [
  'all',
  'drafts',
  'final',
] as const satisfies readonly InvoiceTab[];

const MAX_SEARCH_LENGTH = 100;

/** Next.js searchParams values are `string | string[] | undefined`; a repeated key takes the
 * first occurrence, and anything else (an unexpected shape) becomes undefined. */
function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

// F-32 (review-2026-09-27): `Number('1e20')` is a structurally valid positive integer per
// `z.number().int()`, so an absurdly large page sailed through this schema unclamped and
// overflowed Prisma's `skip` downstream in invoice-actions.ts (`(page - 1) * pageSize`). Capped
// at a value no real pager ever reaches, so it falls back to the documented default like every
// other structurally invalid page.
const MAX_PAGE = 1_000_000;

const pageSchema = z
  .preprocess((value) => {
    const raw = firstString(value);
    return raw === undefined ? NaN : Number(raw);
  }, z.number().int().min(1).max(MAX_PAGE))
  .catch(1);

const pageSizeSchema = z
  .preprocess(
    (value) => {
      const raw = firstString(value);
      return raw === undefined ? NaN : Number(raw);
    },
    z.union([
      z.literal(PAGE_SIZE_OPTIONS[0]),
      z.literal(PAGE_SIZE_OPTIONS[1]),
      z.literal(PAGE_SIZE_OPTIONS[2]),
      z.literal(PAGE_SIZE_OPTIONS[3]),
      z.literal(PAGE_SIZE_OPTIONS[4]),
    ])
  )
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

const tabSchema = z
  .preprocess((value) => firstString(value), z.enum(TABS))
  .catch('all');

const idSchema = z
  .preprocess((value) => firstString(value), z.string().min(1).optional())
  .catch(undefined);

const searchSchema = z
  .preprocess((value) => {
    const raw = firstString(value);
    return typeof raw === 'string'
      ? raw.trim().slice(0, MAX_SEARCH_LENGTH)
      : '';
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
      parsed.dateTo !== undefined && isValidIsoDate(parsed.dateTo)
        ? parsed.dateTo
        : undefined;

    // A reversed, partial, or otherwise unusable range: both bounds are dropped rather than
    // applying only one of them (task file §Inlined context, Link parameters table).
    const validRange =
      dateFrom !== undefined && dateTo !== undefined && dateFrom <= dateTo;

    return {
      ...parsed,
      dateFrom: validRange ? dateFrom : undefined,
      dateTo: validRange ? dateTo : undefined,
    };
  });

// T24 (spec.md §5 AC-25) — the dashboard's `from`/`to`/`preset` link parameters, parsed with a
// current-month fallback instead of a "no range" default: `preset=all-time` drops the range,
// a valid `from<=to` pair is applied as local day bounds, and anything else (missing, malformed,
// or an inverted range) falls back to the current local month in the given time zone, per
// docs/features/architecture-hardening/tasks/t24-dashboard-link-params.md (Checklist item 1) and
// contracts/server-actions.md §Link parameters, Dashboard. `timeZone` is trusted as-is — it was
// already validated by getRequestTimeZone() (T22) — and `now` is injectable so the current-month
// fallback is deterministic under test.
export type DashboardAppliedRange = { start: Date; endExclusive: Date };
export type DashboardLocalPeriod = { from: string; to: string };

const PRESET_NAMES: ReadonlySet<string> = new Set([
  'next-month',
  'this-month',
  'last-month',
  'this-year',
  'last-year',
]);

const presetSchema = z
  .preprocess((value) => firstString(value), z.string().optional())
  .catch(undefined);

/** Falls back to UTC for a zone Intl cannot resolve — belt-and-braces alongside
 * getRequestTimeZone()'s own validation (T22), so this schema never throws on a tampered zone. */
function resolveTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

export function dashboardParamsSchema(
  timeZone: string,
  now: Date = new Date()
) {
  const zone = resolveTimeZone(timeZone);

  return z
    .object({
      from: dateSchema,
      to: dateSchema,
      preset: presetSchema,
    })
    .transform(
      ({
        from,
        to,
        preset,
      }): {
        appliedRange: DashboardAppliedRange | undefined;
        period: DashboardLocalPeriod | undefined;
      } => {
        if (preset === 'all-time') {
          return { appliedRange: undefined, period: undefined };
        }

        // A named preset is resolved here, in the account zone, and beats any from/to pair
        // (AC-22, AC-23): a tab left open past midnight never sends a stale month.
        if (preset !== undefined && PRESET_NAMES.has(preset)) {
          const days = presetPeriodDays(
            preset as PresetPeriodName,
            formatLocalDateKey(now, zone)
          );
          const [start, endExclusive] = localDayRange(days.from, days.to, zone);
          return { appliedRange: { start, endExclusive }, period: days };
        }

        const validFrom =
          from !== undefined && isValidIsoDate(from) ? from : undefined;
        const validTo = to !== undefined && isValidIsoDate(to) ? to : undefined;

        if (
          validFrom !== undefined &&
          validTo !== undefined &&
          validFrom <= validTo &&
          isWithinMaxCustomPeriod(validFrom, validTo)
        ) {
          const [start, endExclusive] = localDayRange(validFrom, validTo, zone);
          return {
            appliedRange: { start, endExclusive },
            period: { from: validFrom, to: validTo },
          };
        }

        const [start, endExclusive] = currentLocalMonth(zone, now);
        return {
          appliedRange: { start, endExclusive },
          period: {
            from: formatLocalDateKey(start, zone),
            to: formatLocalDateKey(new Date(endExclusive.getTime() - 1), zone),
          },
        };
      }
    );
}

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
