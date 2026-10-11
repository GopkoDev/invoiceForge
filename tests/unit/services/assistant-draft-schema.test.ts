// T03 (ai-assistant; spec.md §5 AC-10, AC-29, AC-31) - the zod schemas mirror
// docs/features/ai-assistant/contracts/openapi.yaml one-to-one. The openapi examples are read
// from the YAML itself, so the contract and the schemas cannot drift apart.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import {
  createDraftInvoiceInputSchema,
  draftIssueSchema,
  draftProposalSchema,
  draftRequestSchema,
} from '@/lib/services/assistant-drafts/schema';
import {
  allowanceStateSchema,
  appLinkSchema,
  appPageKeySchema,
  chatRequestSchema,
} from '@/lib/validations/assistant-chat';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const spec = parse(
  readFileSync(
    resolve(process.cwd(), 'docs/features/ai-assistant/contracts/openapi.yaml'),
    'utf8'
  )
) as Json;
const schemas = spec.components.schemas as Json;
const chatExamples = spec.paths['/api/chat'].post.requestBody.content['application/json'].examples as Json;
const draftExample = schemas.DraftCreatedAnswer.example.draft as Json;
const toolErrors = schemas.DraftToolError.examples as Json[];

const request = (over: Json = {}) => ({
  customer: 'Acme',
  lines: [{ description: 'consulting', quantity: '20', unit: 'hours', price: '50' }],
  ...over,
});

describe('draftRequestSchema (DraftRequest)', () => {
  it('accepts the CreateDraftInvoiceInput example without its repeatKey', () => {
    const example = { ...schemas.CreateDraftInvoiceInput.example };
    delete example.repeatKey;
    expect(draftRequestSchema.safeParse(example).success).toBe(true);
  });

  it('accepts customerId instead of customer, and every optional field', () => {
    const full = request({
      customer: undefined,
      customerId: 'clx0cus00000000000000001',
      senderProfile: 'Test Sender',
      currency: '$',
      issueDate: '2026-10-11',
      dueDate: '2026-11-10',
      notes: 'n'.repeat(2000),
    });
    expect(draftRequestSchema.safeParse(full).success).toBe(true);
  });

  it.each([
    ['customer and customerId together', request({ customerId: 'clx0cus00000000000000001' })],
    ['neither customer nor customerId', request({ customer: undefined })],
    ['an empty customer', request({ customer: '' })],
    ['a 201-character customer', request({ customer: 'a'.repeat(201) })],
    ['no lines', request({ lines: [] })],
    ['51 lines', request({ lines: Array.from({ length: 51 }, () => ({ description: 'x' })) })],
    ['an unknown property', request({ taxRate: '10' })],
    ['an unknown line property', request({ lines: [{ description: 'x', discount: '1' }] })],
    ['a line without description', request({ lines: [{ quantity: '1' }] })],
    ['quantity 20.005', request({ lines: [{ description: 'x', quantity: '20.005' }] })],
    ['quantity -1', request({ lines: [{ description: 'x', quantity: '-1' }] })],
    ['price as a number', request({ lines: [{ description: 'x', price: 50 }] })],
    ['a 9-digit price', request({ lines: [{ description: 'x', price: '123456789' }] })],
    ['a unit over 20 characters', request({ lines: [{ description: 'x', unit: 'u'.repeat(21) }] })],
    ['a 9-character currency', request({ currency: 'EUR-EURO!' })],
    ['a malformed date', request({ issueDate: '11/10/2026' })],
    ['notes over 2000 characters', request({ notes: 'n'.repeat(2001) })],
  ])('rejects %s', (_label, value) => {
    expect(draftRequestSchema.safeParse(value).success).toBe(false);
  });

  it('accepts quantities and prices with up to two decimals', () => {
    const lines = [
      { description: 'a', quantity: '1', price: '0.5' },
      { description: 'b', quantity: '12345678.99', price: '10.00' },
    ];
    expect(draftRequestSchema.safeParse(request({ lines })).success).toBe(true);
  });
});

describe('createDraftInvoiceInputSchema (CreateDraftInvoiceInput)', () => {
  it('parses the openapi example including repeatKey', () => {
    const parsed = createDraftInvoiceInputSchema.safeParse(schemas.CreateDraftInvoiceInput.example);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.repeatKey).toBe('req-2026-10-11-001');
  });

  it('rejects an empty or 201-character repeatKey and still enforces the request rules', () => {
    expect(createDraftInvoiceInputSchema.safeParse(request({ repeatKey: '' })).success).toBe(false);
    expect(createDraftInvoiceInputSchema.safeParse(request({ repeatKey: 'k'.repeat(201) })).success).toBe(false);
    expect(createDraftInvoiceInputSchema.safeParse(request({ customerId: 'x' })).success).toBe(false);
    expect(createDraftInvoiceInputSchema.safeParse(request({ extra: 1 })).success).toBe(false);
  });
});

describe('draftProposalSchema (DraftProposal)', () => {
  it('parses the DraftCreatedAnswer example draft (invoiceNumber set)', () => {
    expect(draftProposalSchema.safeParse(draftExample).success).toBe(true);
  });

  it('accepts invoiceNumber null (a card: assigned on creation) and a custom-price line', () => {
    const line = {
      ...draftExample.lines[0],
      productId: 'clx0prod0000000000000001',
      rateSource: 'CUSTOM_PRICE',
      unitSource: 'CATALOGUE',
      agreedCustomPrice: '45.00',
    };
    const value = { ...draftExample, invoiceNumber: null, lines: [line] };
    expect(draftProposalSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['an unknown property', { extra: true }],
    ['no lines', { lines: [] }],
    ['a customer source other than REQUEST', { customer: { ...draftExample.customer, source: 'DEFAULT' } }],
    ['an unknown currency', { currency: 'XXX' }],
    ['a plain-string customer name (not the freelancerText wrapper)', { customer: { ...draftExample.customer, name: 'Acme' } }],
    ['a subtotal with one decimal', { subtotal: '1000.0' }],
    ['a missing total', { total: undefined }],
    ['a missing defaultsUsed', { defaultsUsed: undefined }],
    ['a bad issue-date source', { issueDate: { value: '2026-10-11', source: 'CATALOGUE' } }],
  ])('rejects %s', (_label, over) => {
    expect(draftProposalSchema.safeParse({ ...draftExample, ...over }).success).toBe(false);
  });

  it('rejects a line with an unknown rateSource and 51 lines', () => {
    const bad = { ...draftExample.lines[0], rateSource: 'GUESS' };
    expect(draftProposalSchema.safeParse({ ...draftExample, lines: [bad] }).success).toBe(false);
    const many = Array.from({ length: 51 }, () => draftExample.lines[0]);
    expect(draftProposalSchema.safeParse({ ...draftExample, lines: many }).success).toBe(false);
  });
});

describe('draftIssueSchema (DraftIssue) - AC-31 names what is ambiguous or missing', () => {
  const cus = (n: number) => ({ customerId: `clx0cus${n}`, name: { freelancerText: `Acme ${n}` } });
  const valid: Json[] = [
    { kind: 'NO_SENDER_PROFILE_WITH_ACCOUNT' },
    {
      kind: 'DEFAULT_PROFILE_WITHOUT_ACCOUNT',
      defaultSenderProfileId: 'sp1',
      otherProfiles: [{ senderProfileId: 'sp2', name: { freelancerText: 'Other' } }],
    },
    { kind: 'CUSTOMER_NOT_FOUND', written: 'Acme' },
    { kind: 'CUSTOMER_AMBIGUOUS', written: 'Acme', candidates: [cus(1), cus(2)] },
    { kind: 'CUSTOMER_NEAR_MISS', written: 'Acm', candidates: [cus(1)] },
    { kind: 'LINE_AMOUNT_MISSING', lineIndex: 0, description: 'logo design' },
    { kind: 'LINE_PRICE_MISSING_IN_CURRENCY', lineIndex: 1, currency: 'EUR' },
    { kind: 'CURRENCY_UNCLEAR', written: '$', options: ['USD', 'UAH'] },
    { kind: 'SENDER_PROFILE_NOT_FOUND', written: 'Nope', options: ['Test Sender'] },
    { kind: 'NO_ACCOUNT_IN_CURRENCY', currency: 'PLN', senderProfileId: 'sp1' },
    {
      kind: 'SEVERAL_ACCOUNTS_IN_CURRENCY',
      currency: 'USD',
      accounts: [{ bankAccountId: 'ba1', label: 'Bank ••0000' }],
    },
  ];

  it.each(valid.map((v) => [v.kind, v]))('accepts %s', (_kind, value) => {
    expect(draftIssueSchema.safeParse(value).success).toBe(true);
  });

  it('accepts the issues of the documented VALIDATION tool error example', () => {
    const example = toolErrors.find((e) => e.code === 'VALIDATION') as Json;
    for (const issue of example.details.issues) {
      expect(draftIssueSchema.safeParse(issue).success).toBe(true);
    }
  });

  it.each([
    ['an unknown kind', { kind: 'GUESSED' }],
    ['CUSTOMER_NOT_FOUND without written', { kind: 'CUSTOMER_NOT_FOUND' }],
    ['CUSTOMER_AMBIGUOUS without candidates', { kind: 'CUSTOMER_AMBIGUOUS', written: 'Acme' }],
    [
      'CUSTOMER_AMBIGUOUS with 51 candidates',
      { kind: 'CUSTOMER_AMBIGUOUS', written: 'Acme', candidates: Array.from({ length: 51 }, (_, i) => cus(i)) },
    ],
    ['LINE_AMOUNT_MISSING with a negative lineIndex', { kind: 'LINE_AMOUNT_MISSING', lineIndex: -1, description: 'x' }],
    ['LINE_AMOUNT_MISSING without description', { kind: 'LINE_AMOUNT_MISSING', lineIndex: 0 }],
    ['an unknown currency', { kind: 'LINE_PRICE_MISSING_IN_CURRENCY', lineIndex: 0, currency: 'XXX' }],
    ['a candidate without customerId', { kind: 'CUSTOMER_NEAR_MISS', written: 'a', candidates: [{ name: { freelancerText: 'A' } }] }],
  ])('rejects %s', (_label, value) => {
    expect(draftIssueSchema.safeParse(value).success).toBe(false);
  });
});

describe('appLinkSchema / appPageKeySchema (AppLink)', () => {
  it('accepts an invoice link and page links, with senderProfileId on a page link', () => {
    expect(appLinkSchema.safeParse({ kind: 'invoice', invoiceId: 'inv1', label: 'INV-042' }).success).toBe(true);
    expect(appLinkSchema.safeParse({ kind: 'page', page: 'dashboard' }).success).toBe(true);
    expect(
      appLinkSchema.safeParse({ kind: 'page', page: 'sender-profile-bank-accounts', senderProfileId: 'sp1' }).success
    ).toBe(true);
  });

  it('knows exactly the 13 documented pages', () => {
    expect([...appPageKeySchema.options].sort()).toEqual([...schemas.AppPageKey.enum].sort());
    expect(appPageKeySchema.safeParse('admin').success).toBe(false);
  });

  it.each([
    ['an unknown page', { kind: 'page', page: 'admin' }],
    ['an invoice link without label', { kind: 'invoice', invoiceId: 'inv1' }],
    ['an invoice link without invoiceId', { kind: 'invoice', label: 'INV-1' }],
    ['an unknown kind', { kind: 'url', href: 'https://example.com' }],
    ['an extra property on a page link', { kind: 'page', page: 'invoices', href: '/x' }],
    ['an empty senderProfileId', { kind: 'page', page: 'sender-profiles', senderProfileId: '' }],
  ])('rejects %s', (_label, value) => {
    expect(appLinkSchema.safeParse(value).success).toBe(false);
  });
});

describe('allowanceStateSchema (AllowanceState) - AC-10', () => {
  const state = { limit: 30, used: 30, left: 0, renewsAt: '2026-10-11T21:00:00.000Z', timeZone: 'Europe/Kyiv' };

  it('accepts a used-up allowance and a fresh one', () => {
    expect(allowanceStateSchema.safeParse(state).success).toBe(true);
    expect(allowanceStateSchema.safeParse({ ...state, used: 0, left: 30 }).success).toBe(true);
  });

  it.each([
    ['a limit other than 30', { limit: 31 }],
    ['used above 30', { used: 31 }],
    ['a negative left', { left: -1 }],
    ['a fractional used', { used: 1.5 }],
    ['a renewsAt that is not a date-time', { renewsAt: 'tomorrow' }],
    ['an extra property', { remaining: 3 }],
  ])('rejects %s', (_label, over) => {
    expect(allowanceStateSchema.safeParse({ ...state, ...over }).success).toBe(false);
  });
});

describe('chatRequestSchema (ChatRequest)', () => {
  const message = (text: string, over: Json = {}) => ({
    conversationId: null,
    message: { id: 'm1', role: 'user', parts: [{ type: 'text', text }] },
    ...over,
  });

  it.each(Object.keys(chatExamples))('parses the openapi example %s', (name) => {
    expect(chatRequestSchema.safeParse(chatExamples[name].value).success).toBe(true);
  });

  it('trims the text before measuring and returns the trimmed text', () => {
    const parsed = chatRequestSchema.safeParse(message('  hello  '));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.message.parts[0].text).toBe('hello');
  });

  it('accepts exactly 2,000 characters and rejects 2,001', () => {
    expect(chatRequestSchema.safeParse(message('a'.repeat(2000))).success).toBe(true);
    expect(chatRequestSchema.safeParse(message('a'.repeat(2001))).success).toBe(false);
  });

  it('rejects a text that is only spaces, and one that is over 2,000 only through padding is accepted after trim', () => {
    expect(chatRequestSchema.safeParse(message('    \n\t ')).success).toBe(false);
    expect(chatRequestSchema.safeParse(message(`  ${'a'.repeat(2000)}  `)).success).toBe(true);
  });

  it.each([
    ['an empty text', message('')],
    ['a missing conversationId', { message: message('hi').message }],
    ['an empty conversationId', message('hi', { conversationId: '' })],
    ['an assistant role', { ...message('hi'), message: { id: 'm', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] } }],
    ['an empty id', { ...message('hi'), message: { id: '', role: 'user', parts: [{ type: 'text', text: 'hi' }] } }],
    ['a 65-character id', { ...message('hi'), message: { id: 'i'.repeat(65), role: 'user', parts: [{ type: 'text', text: 'hi' }] } }],
    ['no parts', { ...message('hi'), message: { id: 'm', role: 'user', parts: [] } }],
    [
      'two parts',
      { ...message('hi'), message: { id: 'm', role: 'user', parts: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] } },
    ],
    ['a non-text part', { ...message('hi'), message: { id: 'm', role: 'user', parts: [{ type: 'file', url: 'x' }] } }],
    ['an extra top-level property', message('hi', { model: 'gpt' })],
  ])('rejects %s', (_label, value) => {
    expect(chatRequestSchema.safeParse(value).success).toBe(false);
  });
});
