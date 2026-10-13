// T15 (ai-chat-v2, sad.md §7 Tracing; ai-assistant ADR-0004): the new spans carry metadata only. `chat.choice-check` and
// the read questions (`assistant-tools.customers`, `.products`, `.sender-profiles`) record the `outcome` attribute and
// nothing else: no label, name, record id or canary text. A separate file from ai-spans-metadata-only.test.ts because it
// mocks @sentry/nextjs and @/prisma for the whole file, which would change that file's subject.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const LABEL = 'CANARY-label Crimson Bank ••4242 · USD';
const NAME = 'CANARY-name Initech Holdings';
const CUSTOMER_ID = 'cmcanaryCustomerId0000001';
const ACCOUNT_ID = 'cmcanaryAccountId00000001';
const OFFER_ID = 'cmcanaryOfferId000000001';
const CANARIES = ['CANARY', 'Crimson', 'Initech', '4242', CUSTOMER_ID, ACCOUNT_ID, OFFER_ID, 'u-canary-owner'];

type Recorded = { name: string; attributes: Array<[string, unknown]> };
const recorded: Recorded[] = [];

vi.mock('@sentry/nextjs', () => ({
  startSpan: async (options: { name: string }, callback: (span: any) => unknown) => {
    const entry: Recorded = { name: options.name, attributes: [] };
    recorded.push(entry);
    const span = {
      setAttribute: (key: string, value: unknown) => void entry.attributes.push([key, value]),
      setAttributes: (all: Record<string, unknown>) => void Object.entries(all).forEach(([k, v]) => entry.attributes.push([k, v])),
    };
    return callback(span);
  },
}));

const prismaFake = {
  choiceOffer: { findFirst: vi.fn() },
  bankAccount: { findFirst: vi.fn() },
  customer: { count: vi.fn() },
  senderProfile: { count: vi.fn(), findMany: vi.fn() },
  product: { findFirst: vi.fn() },
};
vi.mock('@/prisma', () => ({ prisma: prismaFake }));

const pageInfo = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
vi.mock('@/lib/services/customers/customers', () => ({
  listCustomersForAssistant: async () => ({
    success: true,
    data: {
      pageInfo,
      rows: [{ customerId: CUSTOMER_ID, name: NAME, companyName: NAME, email: null, phone: null, taxId: null, address: null, city: null, country: null, postalCode: null, defaultCurrency: 'USD' }],
    },
  }),
}));
vi.mock('@/lib/services/products/products', () => ({
  listProductsForAssistant: async () => ({
    success: true,
    data: { pageInfo, customer: { customerId: CUSTOMER_ID, name: NAME }, rows: [{ productId: 'p1', name: NAME, unit: 'hour', price: '50', currency: 'USD', customPrice: null }] },
  }),
}));
vi.mock('@/lib/services/sender-profiles/sender-profiles', () => ({
  listSenderProfilesForAssistant: async () => ({
    success: true,
    data: { pageInfo, rows: [{ senderProfileId: 's1', name: NAME, isDefault: true, bankAccounts: [{ bankAccountId: ACCOUNT_ID, bankName: LABEL, lastFour: '4242', currency: 'USD', isDefault: true }] }] },
  }),
}));

const actor = { userId: 'u-canary-owner', timeZone: 'UTC' } as any;
const context = { actor, keyId: 'k', origin: 'http://localhost' } as any;

const offerRow = {
  id: OFFER_ID,
  conversationId: 'conv1',
  kind: 'BANK_ACCOUNT',
  lineIndex: null,
  request: { customer: NAME, currency: 'USD', lines: [] },
  options: [{ optionId: 0, label: LABEL, ref: { bankAccountId: ACCOUNT_ID } }],
};

function expectMetadataOnly(name: string) {
  const spans = recorded.filter((s) => s.name === name);
  expect(spans, `no span named ${name}`).toHaveLength(1);
  const { attributes } = spans[0];
  expect(attributes.length).toBeGreaterThan(0);
  for (const [key, value] of attributes) {
    expect(key).toBe('outcome');
    expect(typeof value).toBe('string');
    expect(String(value)).toMatch(/^(ok|unavailable|failed|refused:[a-z_]+)$/);
    for (const canary of CANARIES) expect(String(value)).not.toContain(canary);
  }
  expect(JSON.stringify(spans[0])).not.toMatch(/CANARY|Crimson|Initech|4242/);
  return attributes;
}

describe('the ai-chat-v2 spans carry metadata only', () => {
  beforeEach(() => {
    recorded.length = 0;
    vi.clearAllMocks();
  });

  it('chat.choice-check (ok): the only attribute is outcome=ok', async () => {
    const { checkChoice } = await import('@/lib/services/assistant-drafts/offers');
    prismaFake.choiceOffer.findFirst.mockResolvedValue(offerRow);
    prismaFake.bankAccount.findFirst.mockResolvedValue({ senderProfileId: 's1', currency: 'USD' });
    // The request names no profile: the account must be in the current default one (R12-1).
    prismaFake.senderProfile.findMany.mockResolvedValue([{ id: 's1', name: 'Main', isDefault: true }]);

    const result = await checkChoice(actor, { conversationId: 'conv1', offerId: OFFER_ID, optionId: 0 });

    expect(result.ok).toBe(true);
    expect(expectMetadataOnly('chat.choice-check')).toEqual([['outcome', 'ok']]);
  });

  it('chat.choice-check (unavailable): the only attribute is outcome=unavailable', async () => {
    const { checkChoice } = await import('@/lib/services/assistant-drafts/offers');
    prismaFake.choiceOffer.findFirst.mockResolvedValue(null);

    const result = await checkChoice(actor, { conversationId: 'conv1', offerId: OFFER_ID, optionId: 0 });

    expect(result.ok).toBe(false);
    expect(expectMetadataOnly('chat.choice-check')).toEqual([['outcome', 'unavailable']]);
  });

  // Review 2026-10-13 R1-S3: a store failure is its own outcome (the route answers 503, not 409).
  it('chat.choice-check (store failure): outcome=failed, no error text in the span', async () => {
    const { checkChoice } = await import('@/lib/services/assistant-drafts/offers');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    prismaFake.choiceOffer.findFirst.mockRejectedValue(new Error(`boom ${LABEL}`));

    const result = await checkChoice(actor, { conversationId: 'conv1', offerId: OFFER_ID, optionId: 0 });

    expect(result).toEqual({ ok: false, failed: true });
    expect(expectMetadataOnly('chat.choice-check')).toEqual([['outcome', 'failed']]);
  });

  it.each([
    ['assistant-tools.customers', async () => (await import('@/lib/assistant-tools/customers')).customersHandler({ name: NAME } as any, context)],
    ['assistant-tools.products', async () => (await import('@/lib/assistant-tools/products')).productsHandler({ name: NAME, customerId: CUSTOMER_ID } as any, context)],
    ['assistant-tools.sender-profiles', async () => (await import('@/lib/assistant-tools/sender-profiles')).senderProfilesHandler({} as any, context)],
  ])('%s: a read question\'s span has outcome=ok as its only attribute', async (name, run) => {
    const result: any = await run();

    expect(result.success).toBe(true);
    expect(expectMetadataOnly(name)).toEqual([['outcome', 'ok']]);
  });
});
