// T4 (spec.md §5 AC-11..AC-14; ADR-0005) — the shared ListQuery schema, Page envelope and paginate
// helper, proved with in-memory fakes for count/findMany.
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { escapeLike, ilikeAny, paginate, parseListQuery } from '@/lib/services/_shared/list-query';

type Row = { id: string };
type FindArgs = { skip?: number; take?: number; orderBy: unknown[] };

function fakes(total: number) {
  const rows: Row[] = Array.from({ length: total }, (_, i) => ({
    id: `r${String(i + 1).padStart(3, '0')}`,
  }));
  const count = vi.fn(async () => total);
  const findMany = vi.fn(async (args: FindArgs) => {
    const skip = args.skip ?? 0;
    return args.take === undefined ? rows.slice(skip) : rows.slice(skip, skip + args.take);
  });
  return { rows, count, findMany };
}

async function run(total: number, query: Record<string, unknown>) {
  const f = fakes(total);
  const page = await paginate<Row>({
    count: f.count,
    findMany: f.findMany,
    orderBy: [{ name: 'asc' }],
    query,
  } as never);
  return { ...f, page };
}

describe('paginate (AC-11, AC-12, AC-14)', () => {
  it('returns the full list as page 1 when no page or size is given', async () => {
    const { page, rows, findMany } = await run(23, {});
    expect(page).toEqual({
      items: rows,
      total: 23,
      page: 1,
      pageSize: 23,
      totalPages: 1,
      hasMore: false,
    });
    const args = findMany.mock.calls[0][0];
    expect(args.skip).toBeUndefined();
    expect(args.take).toBeUndefined();
  });

  it('answers an empty list with page 1 and no pages', async () => {
    const { page } = await run(0, {});
    expect(page).toEqual({ items: [], total: 0, page: 1, pageSize: 0, totalPages: 0, hasMore: false });
  });

  it('uses page size 10 when a page is given without a size', async () => {
    const { page, rows } = await run(23, { page: 2 });
    expect(page).toEqual({
      items: rows.slice(10, 20),
      total: 23,
      page: 2,
      pageSize: 10,
      totalPages: 3,
      hasMore: true,
    });
  });

  it('uses page 1 when a size is given without a page', async () => {
    const { page } = await run(23, { pageSize: 5 });
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(5);
    expect(page.items).toHaveLength(5);
    expect(page.totalPages).toBe(5);
    expect(page.hasMore).toBe(true);
  });

  it('reports 2 of 5, 3 pages and more results for page 1, size 2 (AC-11 shape)', async () => {
    const { page } = await run(5, { page: 1, pageSize: 2 });
    expect(page).toMatchObject({ total: 5, page: 1, pageSize: 2, totalPages: 3, hasMore: true });
    expect(page.items).toHaveLength(2);
  });

  it('falls back to page 1 when the page is out of range (page 99)', async () => {
    const { page, rows } = await run(5, { page: 99, pageSize: 2 });
    expect(page.page).toBe(1);
    expect(page.items).toEqual(rows.slice(0, 2));
    expect(page.totalPages).toBe(3);
  });

  it('keeps hasMore false on the last page', async () => {
    const { page } = await run(5, { page: 3, pageSize: 2 });
    expect(page).toMatchObject({ page: 3, hasMore: false });
    expect(page.items).toHaveLength(1);
  });

  it('has no page-size cap', async () => {
    const { page } = await run(3, { page: 1, pageSize: 10000 });
    expect(page.pageSize).toBe(10000);
    expect(page.items).toHaveLength(3);
  });

  it('ends every order with id ascending', async () => {
    for (const q of [{}, { page: 2 }, { page: 99, pageSize: 2 }]) {
      const { findMany } = await run(23, q);
      expect(findMany.mock.calls[0][0].orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    }
  });
});

describe('parseListQuery (AC-13)', () => {
  it('accepts an empty query and a 100-character search', () => {
    expect(parseListQuery({})).toMatchObject({ success: true });
    expect(parseListQuery({ search: 'a'.repeat(100) })).toMatchObject({ success: true });
  });

  it('trims the search text', () => {
    const r = parseListQuery({ search: '   ' });
    expect(r.success && (r.data.search ?? '')).toBe('');
  });

  it('accepts a huge page size', () => {
    expect(parseListQuery({ pageSize: 10000 })).toMatchObject({ success: true });
  });

  it.each([2 ** 31, 1e12])('names the allowed range when page or pageSize is %s (T28, R-07)', (value) => {
    expect(parseListQuery({ page: value })).toMatchObject({
      success: false,
      fieldErrors: { page: ['Page must be a whole number from 1 to 2147483647.'] },
    });
    expect(parseListQuery({ pageSize: value })).toMatchObject({
      success: false,
      fieldErrors: { pageSize: ['Page size must be a whole number from 1 to 2147483647.'] },
    });
  });

  it.each([0, -5, 2.5])('refuses page %s', (value) => {
    expect(parseListQuery({ page: value })).toMatchObject({
      success: false,
      code: 'VALIDATION',
      error: 'Invalid list request.',
      fieldErrors: { page: ['Page must be a whole number of at least 1.'] },
    });
  });

  it.each([0, -5, 2.5])('refuses pageSize %s', (value) => {
    expect(parseListQuery({ pageSize: value })).toMatchObject({
      success: false,
      code: 'VALIDATION',
      error: 'Invalid list request.',
      fieldErrors: { pageSize: ['Page size must be a whole number of at least 1.'] },
    });
  });

  it('refuses a 101-character search', () => {
    expect(parseListQuery({ search: 'a'.repeat(101) })).toMatchObject({
      success: false,
      code: 'VALIDATION',
      error: 'Invalid list request.',
      fieldErrors: { search: ['Search text can be at most 100 characters.'] },
    });
  });
});

describe('ilikeAny', () => {
  it('builds a case-insensitive OR over the fields', () => {
    expect(ilikeAny(['name', 'email'], 'acme')).toEqual({
      OR: [
        { name: { contains: 'acme', mode: 'insensitive' } },
        { email: { contains: 'acme', mode: 'insensitive' } },
      ],
    });
  });

  it('adds no filter for an empty search', () => {
    expect(ilikeAny(['name'], '')).toEqual({});
  });
});

describe('T21 hardening (S-09, S-10)', () => {
  it('refuses a page or page size above 2^31-1 as VALIDATION', () => {
    for (const key of ['page', 'pageSize']) {
      const res = parseListQuery({ [key]: 1e20 });
      expect(res.success).toBe(false);
      expect(parseListQuery({ [key]: 2 ** 31 - 1 }).success).toBe(true);
    }
  });

  it('escapes backslash, percent and underscore for ILIKE', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    expect(ilikeAny(['name'], '%').OR).toEqual([{ name: { contains: '\\%', mode: 'insensitive' } }]);
  });
});
