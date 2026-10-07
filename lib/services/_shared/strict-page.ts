// T14 (spec.md §5 AC-18, AC-18b): strict paging for every Assistant list. Unlike `paginate`, a page
// past the last one is a NOT_FOUND with PAGE_OUT_OF_RANGE details, never page 1; the page size is
// capped at 50 and the cap is reported.
import 'server-only';
import { fail, type ActionFailure } from '@/types/result';

export const MAX_ASSISTANT_PAGE_SIZE = 50;
export const DEFAULT_ASSISTANT_PAGE_SIZE = 20;

export type StrictPagePlan = {
  page: number;
  /** The size applied, after the cap. */
  pageSize: number;
  pageSizeCapped: boolean;
  offset: number;
  limit: number;
};

export type StrictPageInfo = {
  page: number;
  pageSize: number;
  pageSizeCapped: boolean;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export function strictPage(input: { page?: number; pageSize?: number }): StrictPagePlan {
  const requested = input.pageSize ?? DEFAULT_ASSISTANT_PAGE_SIZE;
  const pageSizeCapped = requested > MAX_ASSISTANT_PAGE_SIZE;
  const pageSize = Math.min(requested, MAX_ASSISTANT_PAGE_SIZE);
  const page = input.page ?? 1;
  return { page, pageSize, pageSizeCapped, offset: (page - 1) * pageSize, limit: pageSize };
}

function lastPageOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** True when `page` is past the last page. Page 1 of an empty list is not out of range. */
export function isPageOutOfRange(page: number, total: number, pageSize: number): boolean {
  return page > lastPageOf(total, pageSize);
}

export function pageOutOfRange(total: number, pageSize: number): ActionFailure {
  const lastPage = lastPageOf(total, pageSize);
  return fail('NOT_FOUND', `That page does not exist: ${total} matches fit on ${lastPage} page(s).`, {
    details: { kind: 'PAGE_OUT_OF_RANGE', total, lastPage },
  });
}

export function strictPageInfo(plan: StrictPagePlan, total: number): StrictPageInfo {
  const totalPages = Math.ceil(total / plan.pageSize);
  return {
    page: plan.page,
    pageSize: plan.pageSize,
    pageSizeCapped: plan.pageSizeCapped,
    total,
    totalPages,
    hasMore: plan.page < totalPages,
  };
}
