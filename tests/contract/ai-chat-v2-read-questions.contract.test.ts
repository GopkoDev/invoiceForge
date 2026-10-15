// ai-chat-v2 T07 (AC-03, AC-06; spec §6 "Bank account exposure" and "100 % of the look-alike fixture set";
// contracts/openapi.yaml ListCustomersInputV2, CustomersAnswerV2, SenderProfilesAnswer, ProductsAnswer): the three
// new/changed read questions measured against the openapi schemas, the account-number rule over their output schemas,
// the shared look-alike fixture set and the 10-tool listing. Unit tier: no database.
/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('@/lib/services/personal-keys/usage', () => ({ recordPersonalKeyUsage: vi.fn() }));
vi.mock('@/lib/services/dashboard/assistant-reads', () => ({}));
vi.mock('@/lib/services/customers/customers', () => ({}));
vi.mock('@/lib/services/sender-profiles/sender-profiles', () => ({}));
vi.mock('@/lib/services/products/products', () => ({}));
vi.mock('@/lib/services/invoices/assistant-search', () => ({}));
vi.mock('@/lib/services/invoices/find-by-reference', () => ({}));
vi.mock('@/lib/services/assistant-drafts/create-for-key', () => ({ createDraftForKey: vi.fn() }));

import { READ_QUESTIONS } from '@/lib/assistant-tools';
import { createMcpServer } from '@/lib/mcp/server';
import { foldName } from '@/lib/helpers/fold-name';
import { actingFreelancerForTest } from '../support/acting-freelancer';
import { DISTINCT_NAMES, LOOK_ALIKE_PAIRS } from '../support/fixtures/look-alike-names';

const SPEC = path.resolve(process.cwd(), 'docs/features/ai-chat-v2/contracts/openapi.yaml');
const THREE = ['list_sender_profiles', 'list_products', 'list_customers'] as const;

const question = (name: string) => {
  const q = READ_QUESTIONS.find((r) => r.definition.name === name);
  if (!q) throw new Error(`read question ${name} is not registered`);
  return q.definition;
};

let specPromise: Promise<any> | undefined;
const schemas = async () => (await (specPromise ??= SwaggerParser.dereference(SPEC) as Promise<any>)).components.schemas;
function validatorFor(schema: unknown) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema as object);
}

const CUSTOMER_ROW = {
  customerId: 'clx0cus00000000000000001',
  name: { freelancerText: 'Оohn  Doe' },
  companyName: null,
  email: 'john@example.test',
  phone: null,
  taxId: { freelancerText: 'TAX-1' },
  address: null,
  city: { freelancerText: 'Kyiv' },
  country: null,
  postalCode: null,
  defaultCurrency: 'USD',
};
const PAGE_INFO = { page: 1, pageSize: 20, pageSizeCapped: false, total: 1, totalPages: 1, hasMore: false };

describe('read-question outputs against contracts/openapi.yaml (AC-06)', () => {
  it('SenderProfilesAnswer example is accepted by the list_sender_profiles output schema and the openapi schema', async () => {
    const s = await schemas();
    const example = s.SenderProfilesAnswer.example;
    expect(example).toBeDefined();
    expect(question('list_sender_profiles').outputSchema.safeParse(example).success).toBe(true);
    const validate = validatorFor(s.SenderProfilesAnswer);
    expect(validate(example), JSON.stringify(validate.errors)).toBe(true);
  });

  it('ProductsAnswer example is accepted by the list_products output schema and the openapi schema', async () => {
    const s = await schemas();
    const example = s.ProductsAnswer.example;
    expect(example).toBeDefined();
    expect(question('list_products').outputSchema.safeParse(example).success).toBe(true);
    const validate = validatorFor(s.ProductsAnswer);
    expect(validate(example), JSON.stringify(validate.errors)).toBe(true);
  });

  it('a CustomersAnswerV2 body is accepted by the list_customers output schema and the openapi schema', async () => {
    const s = await schemas();
    const body = { rows: [CUSTOMER_ROW], pageInfo: PAGE_INFO };
    expect(question('list_customers').outputSchema.safeParse(body).success).toBe(true);
    const validate = validatorFor(s.CustomersAnswerV2);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  });

  it('CustomersAnswerV2 holds at most 20 rows and the output schema documents it', async () => {
    const s = await schemas();
    expect(s.CustomersAnswerV2.properties.rows.maxItems).toBe(20);
    const twentyOne = { rows: Array.from({ length: 21 }, () => CUSTOMER_ROW), pageInfo: { ...PAGE_INFO, total: 21 } };
    expect(validatorFor(s.CustomersAnswerV2)(twentyOne)).toBe(false);
  });

  it('the input schemas accept what ListCustomersInputV2 / ListProductsInput / ListSenderProfilesInput accept', async () => {
    const s = await schemas();
    const customers = { page: 1, pageSize: 20, name: 'oohn doe' };
    expect(validatorFor(s.ListCustomersInputV2)(customers)).toBe(true);
    expect(question('list_customers').inputSchema.safeParse(customers).success).toBe(true);
    const products = { name: 'Consulting', customerId: 'clx0cus00000000000000001', page: 1, pageSize: 20 };
    expect(validatorFor(s.ListProductsInput)(products)).toBe(true);
    expect(question('list_products').inputSchema.safeParse(products).success).toBe(true);
    expect(question('list_sender_profiles').inputSchema.safeParse({ page: 1, pageSize: 20 }).success).toBe(true);
  });
});

describe('list_customers description says 20, not 50 (AC-03, openapi ListCustomersInputV2)', () => {
  it('the pageSize input says it is capped at 20', () => {
    const shape = (question('list_customers').inputSchema as any).shape;
    expect(shape.pageSize.description).toMatch(/above 20 is capped at 20/i);
    expect(shape.pageSize.description).not.toMatch(/50/);
  });

  it('the rows output says "At most 20 per page"', () => {
    const shape = (question('list_customers').outputSchema as any).shape;
    expect(shape.rows.description).toContain('At most 20 per page');
    expect(shape.rows.description).not.toMatch(/50/);
  });
});

// Every key reachable in a zod output schema (objects, arrays, nullable/optional wrappers).
function keysOf(node: any, out = new Set<string>(), seen = new Set<any>()): Set<string> {
  if (!node || seen.has(node)) return out;
  seen.add(node);
  const def = node._def ?? node.def;
  const shape = typeof node.shape === 'function' ? node.shape() : (node.shape ?? def?.shape);
  const resolved = typeof shape === 'function' ? shape() : shape;
  if (resolved) {
    for (const [k, v] of Object.entries(resolved)) {
      out.add(k);
      keysOf(v, out, seen);
    }
  }
  for (const child of [def?.type, def?.innerType, def?.element, node.element]) {
    if (child && typeof child === 'object') keysOf(child, out, seen);
  }
  return out;
}

describe('no full bank account number in any read output schema (spec §6, AC-06)', () => {
  const FORBIDDEN = /^(account_?number|accountnr|iban|swift|bic|accountname)$/i;

  it.each(THREE)('%s has no accountNumber / iban / swift field', (name) => {
    const keys = [...keysOf(question(name).outputSchema)];
    expect(keys.length).toBeGreaterThan(3); // the walk actually descended into the rows
    expect(keys.filter((k) => FORBIDDEN.test(k))).toEqual([]);
  });

  it('list_sender_profiles exposes the account as lastFour only', () => {
    const keys = keysOf(question('list_sender_profiles').outputSchema);
    expect(keys.has('lastFour')).toBe(true);
    expect(keys.has('bankAccountId')).toBe(true);
  });
});

describe('look-alike fixture set (ADR-0004; spec §6 100 % NFR)', () => {
  it.each(LOOK_ALIKE_PAIRS.map(([stored, written, why]) => [stored, written, why]))(
    'folds %j and %j to the same substring match (%s)',
    (stored, written) => {
      expect(foldName(stored).includes(foldName(written))).toBe(true);
    }
  );

  it.each(DISTINCT_NAMES.map(([a, b]) => [a, b]))('keeps %j and %j distinct', (a, b) => {
    expect(foldName(a).includes(foldName(b))).toBe(false);
    expect(foldName(b).includes(foldName(a))).toBe(false);
  });
});

describe('tools/list holds the 10 tools (T07)', () => {
  it('lists 7 reads + create_draft_invoice + list_sender_profiles + list_products, each read-only except the draft', async () => {
    const server = createMcpServer({
      actor: await actingFreelancerForTest('u1'),
      keyId: 'k1',
      origin: 'http://localhost',
      canCreateDrafts: false,
      name: 'Claude Desktop',
      keyName: 'Claude Desktop',
      key: { id: 'k1', name: 'Claude Desktop', canCreateDrafts: false },
    } as Parameters<typeof createMcpServer>[0]);
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 't', version: '1' });
    await server.connect(serverT);
    await client.connect(clientT);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(10);
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['list_sender_profiles', 'list_products', 'list_customers', 'create_draft_invoice'])
    );
    expect(tools.filter((t) => t.annotations?.readOnlyHint === true)).toHaveLength(9);
    const customers = tools.find((t) => t.name === 'list_customers')!;
    expect(JSON.stringify(customers.inputSchema)).toMatch(/above 20 is capped at 20/i);
  });
});
