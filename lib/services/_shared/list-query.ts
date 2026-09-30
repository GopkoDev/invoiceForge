import 'server-only';
import { z } from 'zod';
import { ok, type ActionResult } from '@/types/result';
import { zodValidationFailure } from '@/lib/services/_shared/result-helpers';

/** Default page size when a page is requested without one (AC-12). No upper cap (spec §3). */
const DEFAULT_PAGE_SIZE = 10;

const PAGE_MESSAGE = 'Page must be a whole number of at least 1.';
const PAGE_SIZE_MESSAGE = 'Page size must be a whole number of at least 1.';

export const listQuerySchema = z.object({
  search: z.string().trim().max(100, 'Search text can be at most 100 characters.').optional(),
  page: z
    .number({ message: PAGE_MESSAGE })
    .int(PAGE_MESSAGE)
    .min(1, PAGE_MESSAGE)
    .optional(),
  pageSize: z
    .number({ message: PAGE_SIZE_MESSAGE })
    .int(PAGE_SIZE_MESSAGE)
    .min(1, PAGE_SIZE_MESSAGE)
    .optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
};

export function parseListQuery(input: unknown): ActionResult<ListQuery> {
  const parsed = listQuerySchema.safeParse(input ?? {});
  if (!parsed.success) return zodValidationFailure(parsed.error, 'Invalid list request.');
  return ok(parsed.data);
}

type OrderBy = Record<string, unknown>;

export async function paginate<T>(args: {
  count: () => Promise<number>;
  findMany: (args: { skip?: number; take?: number; orderBy: OrderBy[] }) => Promise<T[]>;
  orderBy: OrderBy[];
  query: ListQuery;
}): Promise<Page<T>> {
  const { count, findMany, orderBy, query } = args;
  const total = await count();
  const finalOrder = [...orderBy, { id: 'asc' }];

  if (query.page === undefined && query.pageSize === undefined) {
    const items = await findMany({ orderBy: finalOrder });
    return { items, total, page: 1, pageSize: total, totalPages: total > 0 ? 1 : 0, hasMore: false };
  }

  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const totalPages = Math.ceil(total / pageSize);
  let page = query.page ?? 1;
  if (page > totalPages) page = 1;

  const items = await findMany({ skip: (page - 1) * pageSize, take: pageSize, orderBy: finalOrder });
  return { items, total, page, pageSize, totalPages, hasMore: page < totalPages };
}

/** Case-insensitive substring match over any of `fields`; an empty search adds no filter. */
export function ilikeAny(fields: string[], search: string): { OR?: Record<string, unknown>[] } {
  if (search === '') return {};
  return {
    OR: fields.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })),
  };
}
