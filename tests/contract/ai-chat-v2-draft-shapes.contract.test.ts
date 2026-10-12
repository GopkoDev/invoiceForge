// ai-chat-v2 T08 (AC-04, AC-10; spec §6 "Bank account exposure"; contracts/openapi.yaml DraftRequestDelta,
// CustomerCandidate, BankAccountCandidate, ProductCandidate, SenderProfileRef, AccountLastFour): the draft request and
// issue zod schemas accept the additive shapes, those shapes validate against the dereferenced openapi schemas, and no
// candidate has a field for a full account number. Unit tier: no database.
/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  createDraftInvoiceInputSchema,
  draftIssueSchema,
  draftRequestSchema,
} from '@/lib/services/assistant-drafts/schema';

const SPEC = path.resolve(process.cwd(), 'docs/features/ai-chat-v2/contracts/openapi.yaml');
const BOTH = 'Give at most one of senderProfile and senderProfileId.';

let specPromise: Promise<any> | undefined;
const schemas = async () => (await (specPromise ??= SwaggerParser.dereference(SPEC) as Promise<any>)).components.schemas;
function validatorFor(schema: unknown) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema as object);
}

const name = (t: string) => ({ freelancerText: t });
const customer = (n: number, email: string | null) => ({ customerId: `clx0cus0000000000000000${n}`, name: name(`Acme ${n}`), email });
const account = (n: number) => ({
  bankAccountId: `clx0ba00000000000000000${n}`,
  label: `Wise ••123${n}`,
  bankName: name('Wise'),
  lastFour: `123${n}`,
  currency: 'EUR',
});
const product = (n: number, price: string) => ({
  productId: `clx0pr00000000000000000${n}`,
  name: name(`Consulting ${n}`),
  unit: 'hours',
  price,
  currency: 'USD',
});
const profileRef = { senderProfileId: 'clx0sp000000000000000001', name: name('Studio') };

const ISSUES = {
  CUSTOMER_AMBIGUOUS: { kind: 'CUSTOMER_AMBIGUOUS', written: 'Acme', candidates: [customer(1, 'a@acme.test'), customer(2, null)] },
  CUSTOMER_NEAR_MISS: { kind: 'CUSTOMER_NEAR_MISS', written: 'Acm', candidates: [customer(1, 'a@acme.test')] },
  SEVERAL_ACCOUNTS_IN_CURRENCY: { kind: 'SEVERAL_ACCOUNTS_IN_CURRENCY', currency: 'EUR', accounts: [account(1), account(2)] },
  BANK_ACCOUNT_NOT_FOUND: { kind: 'BANK_ACCOUNT_NOT_FOUND', written: 'Monzo', accounts: [account(1)] },
  BANK_ACCOUNT_AMBIGUOUS: { kind: 'BANK_ACCOUNT_AMBIGUOUS', written: 'Wise', accounts: [account(1), account(2)] },
  PRODUCT_AMBIGUOUS: {
    kind: 'PRODUCT_AMBIGUOUS',
    lineIndex: 0,
    written: 'consulting',
    candidates: [product(1, '50.00'), product(2, '40.00')],
  },
  SENDER_PROFILE_NOT_FOUND: { kind: 'SENDER_PROFILE_NOT_FOUND', written: 'Nope', options: ['Studio'], profiles: [profileRef] },
} as const;

const ITEM_SCHEMA: Record<string, [string, string]> = {
  CUSTOMER_AMBIGUOUS: ['candidates', 'CustomerCandidate'],
  CUSTOMER_NEAR_MISS: ['candidates', 'CustomerCandidate'],
  SEVERAL_ACCOUNTS_IN_CURRENCY: ['accounts', 'BankAccountCandidate'],
  BANK_ACCOUNT_NOT_FOUND: ['accounts', 'BankAccountCandidate'],
  BANK_ACCOUNT_AMBIGUOUS: ['accounts', 'BankAccountCandidate'],
  PRODUCT_AMBIGUOUS: ['candidates', 'ProductCandidate'],
  SENDER_PROFILE_NOT_FOUND: ['profiles', 'SenderProfileRef'],
};

const request = (over: Record<string, unknown> = {}) => ({
  customer: 'Acme',
  lines: [{ description: 'consulting', quantity: '10', unit: 'hours', price: '1600' }],
  ...over,
});

describe('issue candidates against contracts/openapi.yaml (AC-04, AC-10)', () => {
  it.each(Object.entries(ISSUES))('%s: items validate against the openapi candidate schema', async (kind, issue) => {
    const s = await schemas();
    const [field, schemaName] = ITEM_SCHEMA[kind];
    const validate = validatorFor(s[schemaName]);
    for (const item of (issue as any)[field]) expect(validate(item), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each(Object.entries(ISSUES))('%s is accepted by draftIssueSchema', (_kind, issue) => {
    const parsed = draftIssueSchema.safeParse(issue);
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
  });

  it('a Customer candidate keeps its email, a null email included', () => {
    const parsed = draftIssueSchema.parse(ISSUES.CUSTOMER_AMBIGUOUS) as any;
    expect(parsed.candidates.map((c: any) => c.email)).toEqual(['a@acme.test', null]);
  });

  it('a bank-account candidate keeps bank name, last four and currency; a product candidate unit, price and currency', () => {
    const accounts = (draftIssueSchema.parse(ISSUES.BANK_ACCOUNT_AMBIGUOUS) as any).accounts;
    expect(accounts[0]).toEqual(account(1));
    const candidates = (draftIssueSchema.parse(ISSUES.PRODUCT_AMBIGUOUS) as any).candidates;
    expect(candidates[1]).toEqual(product(2, '40.00'));
  });

  it('SENDER_PROFILE_NOT_FOUND keeps profiles[] beside options', () => {
    expect((draftIssueSchema.parse(ISSUES.SENDER_PROFILE_NOT_FOUND) as any).profiles).toEqual([profileRef]);
  });

  it.each([
    ['a Customer candidate without email', { ...ISSUES.CUSTOMER_AMBIGUOUS, candidates: [{ customerId: 'c1', name: name('A') }] }],
    ['a bank account candidate without lastFour', { ...ISSUES.BANK_ACCOUNT_AMBIGUOUS, accounts: [{ ...account(1), lastFour: undefined }] }],
    ['a bank account candidate without bankName', { ...ISSUES.BANK_ACCOUNT_AMBIGUOUS, accounts: [{ ...account(1), bankName: undefined }] }],
    ['a product candidate without price', { ...ISSUES.PRODUCT_AMBIGUOUS, candidates: [{ ...product(1, '1.00'), price: undefined }] }],
    ['a product price that is not a decimal string', { ...ISSUES.PRODUCT_AMBIGUOUS, candidates: [product(1, 'forty')] }],
    ['a last four longer than four characters', { ...ISSUES.BANK_ACCOUNT_AMBIGUOUS, accounts: [{ ...account(1), lastFour: '12345' }] }],
    ['SENDER_PROFILE_NOT_FOUND without profiles', { kind: 'SENDER_PROFILE_NOT_FOUND', written: 'x', options: [] }],
  ])('rejects %s', (_label, value) => {
    expect(draftIssueSchema.safeParse(value).success).toBe(false);
  });

  it('no candidate schema (zod or openapi) has a field for a full account number', async () => {
    const forbidden = /^(accountNumber|accountName|iban|swift|swiftCode|number|fullNumber)$/i;
    const s = await schemas();
    const keys = (shape: Record<string, unknown>) => Object.keys(shape);
    const bankOpenapi = keys(s.BankAccountCandidate.properties);
    expect(bankOpenapi.filter((k) => forbidden.test(k))).toEqual([]);
    expect(s.BankAccountCandidate.additionalProperties).toBe(false);
    // zod: a stray accountNumber on a candidate must not survive parsing
    const withNumber = { ...ISSUES.BANK_ACCOUNT_AMBIGUOUS, accounts: [{ ...account(1), accountNumber: 'UA213223130000026007233566001' }] };
    const parsed = draftIssueSchema.safeParse(withNumber);
    if (parsed.success) {
      expect(JSON.stringify(parsed.data)).not.toContain('UA2132');
    }
    const lastFour = s.AccountLastFour;
    expect(validatorFor(lastFour)('UA213223130000026007233566001')).toBe(false);
  });
});

describe('DraftRequest senderProfileId (AC-04)', () => {
  it.each([
    ['draftRequestSchema', draftRequestSchema],
    ['createDraftInvoiceInputSchema', createDraftInvoiceInputSchema],
  ] as const)('%s: senderProfileId alone parses and is kept', (_n, schema) => {
    const parsed = schema.safeParse(request({ senderProfileId: 'clx0sp000000000000000002' }));
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
    expect((parsed as any).data.senderProfileId).toBe('clx0sp000000000000000002');
  });

  it.each([
    ['draftRequestSchema', draftRequestSchema],
    ['createDraftInvoiceInputSchema', createDraftInvoiceInputSchema],
  ] as const)('%s: senderProfile alone still parses', (_n, schema) => {
    expect(schema.safeParse(request({ senderProfile: 'Consulting FOP' })).success).toBe(true);
  });

  it.each([
    ['draftRequestSchema', draftRequestSchema],
    ['createDraftInvoiceInputSchema', createDraftInvoiceInputSchema],
  ] as const)('%s: both senderProfile and senderProfileId is refused with the exact words', (_n, schema) => {
    const parsed = schema.safeParse(request({ senderProfile: 'Studio', senderProfileId: 'clx0sp000000000000000001' }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.map((i) => i.message)).toContain(BOTH);
  });

  it('the openapi DraftRequestDelta example parses', async () => {
    const s = await schemas();
    expect(draftRequestSchema.safeParse(s.DraftRequestDelta.example).success).toBe(true);
  });
});
