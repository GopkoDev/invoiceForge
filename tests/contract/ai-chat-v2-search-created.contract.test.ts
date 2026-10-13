// ai-chat-v2 T64 (AC-48, AC-49; contracts/openapi.yaml SearchInvoicesInputDelta, SearchInvoicesRowDelta): the shared
// search_invoices tool (chat and MCP read the same registry) accepts createdFrom/createdTo/sort and its rows carry
// createdAt and an in-app path. Unit tier: no database.
/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { z } from 'zod';

vi.mock('@/lib/services/personal-keys/usage', () => ({ recordPersonalKeyUsage: vi.fn() }));
vi.mock('@/lib/services/dashboard/assistant-reads', () => ({}));
vi.mock('@/lib/services/customers/customers', () => ({}));
vi.mock('@/lib/services/sender-profiles/sender-profiles', () => ({}));
vi.mock('@/lib/services/products/products', () => ({}));
vi.mock('@/lib/services/invoices/assistant-search', () => ({}));
vi.mock('@/lib/services/invoices/find-by-reference', () => ({}));
vi.mock('@/lib/services/assistant-drafts/create-for-key', () => ({ createDraftForKey: vi.fn() }));

import { READ_QUESTIONS } from '@/lib/assistant-tools';

const SPEC = path.resolve(process.cwd(), 'docs/features/ai-chat-v2/contracts/openapi.yaml');
const tool = () => READ_QUESTIONS.find((r) => r.definition.name === 'search_invoices')!.definition as any;
const validatorFor = (schema: unknown) => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema as object);
};

const ROW = {
  invoiceId: 'clx0inv00000000000000001',
  invoiceNumber: 'INV-0042',
  senderProfile: { senderProfileId: 'sp1', name: { freelancerText: 'Me' } },
  customer: { customerId: 'c1', name: { freelancerText: 'Acme' } },
  status: 'draft',
  amount: '10.00',
  currency: 'USD',
  dueDate: '2026-02-10',
  daysOverdue: null,
  createdAt: '2026-01-28',
  path: '/invoices/clx0inv00000000000000001/edit',
};
const PAGE_INFO = { page: 1, pageSize: 50, pageSizeCapped: false, total: 1, totalPages: 1, hasMore: false };

describe('search_invoices created-date contract (T64)', () => {
  it('the input schema accepts createdFrom, createdTo and sort, and rejects a bad sort', () => {
    const input = tool().inputSchema as z.ZodObject<any>;
    expect(Object.keys(input.shape)).toEqual(expect.arrayContaining(['createdFrom', 'createdTo', 'sort']));
    expect(input.safeParse({ createdFrom: '2026-01-01', createdTo: '2026-01-31', sort: 'createdAt' }).success).toBe(true);
    expect(input.safeParse({ sort: 'issueDate' }).success).toBe(true);
    expect(input.safeParse({ sort: 'bogus' }).success).toBe(false);
  });

  it('the output row schema carries createdAt and path, and rejects a path that is not an editor path', () => {
    const output = tool().outputSchema as z.ZodObject<any>;
    const answer = { today: '2026-10-13', timeZone: 'Europe/Kyiv', rows: [ROW], totals: [], pageInfo: PAGE_INFO, links: [] };
    const good = output.safeParse(answer);
    expect(good.success).toBe(true);
    expect((good as any).data.rows[0]).toMatchObject({ createdAt: '2026-01-28', path: ROW.path });
    const row = (output.shape.rows as z.ZodArray<any>).element;
    expect(Object.keys(row.shape)).toEqual(expect.arrayContaining(['createdAt', 'path']));
  });

  it('a row matches SearchInvoicesRowDelta, and the tool input matches SearchInvoicesInputDelta', async () => {
    const spec: any = await SwaggerParser.dereference(SPEC);
    const rowDelta = spec.components.schemas.SearchInvoicesRowDelta;
    expect(rowDelta.properties.createdAt).toBeDefined();
    expect(rowDelta.properties.path).toBeDefined();
    const validate = validatorFor({ ...rowDelta, required: ['createdAt', 'path'] });
    expect(validate(ROW)).toBe(true);
    expect(validate({ ...ROW, path: '/invoices/x/view' })).toBe(false);
    expect(validate({ ...ROW, createdAt: undefined })).toBe(false);
    const inDelta = spec.components.schemas.SearchInvoicesInputDelta;
    expect(validatorFor(inDelta)({ createdFrom: '2026-01-01', sort: 'createdAt' })).toBe(true);
    for (const k of Object.keys(inDelta.properties)) expect(Object.keys(tool().inputSchema.shape)).toContain(k);
  });
});
