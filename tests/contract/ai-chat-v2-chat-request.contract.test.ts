// T51 (revision 2026-10-13, ADR-0011): the `press` example is replaced by the `form` example (ChatForm); `choice` is
// removed from the contract's ChatRequest (the server schema drops it with the route switch in T57).
// T14 (ai-chat-v2, AC-08, AC-29; contracts/openapi.yaml sendChatMessage, ChatRequest): the three request examples validate
// against the ChatRequest schema AND parse with chatRequestSchema; every field-combination violation is refused with the
// field named; the 409 example is the route's refusal body. Unit tier: no database.
/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { chatRequestSchema } from '@/lib/validations/assistant-chat';
import { CHOICE_UNAVAILABLE_MESSAGE } from '@/types/result';

const SPEC = path.resolve(process.cwd(), 'docs/features/ai-chat-v2/contracts/openapi.yaml');

let specPromise: Promise<any> | undefined;
const spec = () => (specPromise ??= SwaggerParser.dereference(SPEC) as Promise<any>);
function validatorFor(schema: unknown) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema as object);
}
const operation = async () => (await spec()).paths['/api/chat'].post;

const MESSAGE = { id: 'msg_client_01', role: 'user', parts: [{ type: 'text', text: 'Acme GmbH' }] };
const base = (extra: Record<string, unknown> = {}, conversationId: string | null = 'clx0conv0000000000000001') => ({
  conversationId,
  message: MESSAGE,
  ...extra,
});
const CHOICE = { offerId: 'clx0offer000000000000001', optionId: 1 };

describe('sendChatMessage request examples (openapi)', () => {
  it.each(['form', 'dashboardPrompt', 'createWithAiFromDashboard'])('AC-08 / AC-29: the %s example validates against ChatRequest and parses with chatRequestSchema', async (name) => {
    const op = await operation();
    const example = op.requestBody.content['application/json'].examples[name].value;
    const validate = validatorFor(op.requestBody.content['application/json'].schema);

    expect(validate(example), JSON.stringify(validate.errors)).toBe(true);
    const parsed = chatRequestSchema.safeParse(example);
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(example);
  });

  it('AC-12b: the removed `press` example (a `choice`) is refused by the contract ChatRequest (unknown key)', async () => {
    const op = await operation();
    const example = op.requestBody.content['application/json'].examples.press.value;
    const validate = validatorFor(op.requestBody.content['application/json'].schema);
    expect(validate(example)).toBe(false);
    expect(validate.errors?.some((e: any) => e.keyword === 'additionalProperties' && e.params.additionalProperty === 'choice')).toBe(true);
  });
});

describe('the 409 CHOICE_UNAVAILABLE refusal', () => {
  it('AC-12b: the documented example is the route\'s refusal body, and it validates against ActionFailure', async () => {
    const op = await operation();
    const example = op.responses['409'].content['application/json'].example;
    const validate = validatorFor(op.responses['409'].content['application/json'].schema);
    expect(validate(example)).toBe(true);
    expect(example).toEqual({
      success: false,
      code: 'CONFLICT',
      error: 'This form is no longer available. Answer the latest questions or type your request.',
      details: { kind: 'CHOICE_UNAVAILABLE' },
    });
    expect(example.error).toBe(CHOICE_UNAVAILABLE_MESSAGE);
  });
});

describe('chatRequestSchema: field combinations (ChatRequest)', () => {
  const fieldsOf = (input: unknown) => {
    const r = chatRequestSchema.safeParse(input);
    expect(r.success, 'expected the request to be refused').toBe(false);
    if (r.success) return {} as Record<string, string[]>;
    return r.error.flatten().fieldErrors as Record<string, string[]>;
  };

  // ---------- T51: the Question form (ChatForm) ----------
  const FORM = { formId: 'clx0offer000000000000002', answers: [{ questionId: 0, optionId: 1 }, { questionId: 1, text: '40' }] };

  it('AC-08: accepts a form in a saved Conversation (picked option, typed text, skip)', () => {
    expect(chatRequestSchema.safeParse(base({ form: FORM })).success).toBe(true);
    expect(chatRequestSchema.safeParse(base({ form: { ...FORM, answers: [{ questionId: 2, skipped: true }] } })).success).toBe(true);
  });

  it('AC-12b: refuses a form with conversationId null, keyed `form`', () => {
    expect(fieldsOf(base({ form: FORM }, null)).form).toEqual(['A form can only be sent in a saved conversation.']);
  });

  it('refuses a form together with an origin (FORM is set by the server)', () => {
    const f = fieldsOf(base({ form: FORM, origin: 'TYPED' }));
    expect(f.origin).toBeDefined();
  });

  it('refuses origin FORM from the client', () => {
    expect(fieldsOf(base({ origin: 'FORM' }, null)).origin).toBeDefined();
  });

  it.each([
    ['two answers for one question', { ...FORM, answers: [{ questionId: 0, optionId: 1 }, { questionId: 0, text: 'Acme' }] }],
    ['no answers', { ...FORM, answers: [] }],
    ['seven answers', { ...FORM, answers: Array.from({ length: 7 }, (_, i) => ({ questionId: i, optionId: 0 })) }],
    ['an empty formId', { ...FORM, formId: '' }],
    ['a formId over 64 characters', { ...FORM, formId: 'x'.repeat(65) }],
    ['an optionId above 7', { ...FORM, answers: [{ questionId: 0, optionId: 8 }] }],
    ['a questionId above 5', { ...FORM, answers: [{ questionId: 6, optionId: 0 }] }],
    ['a label sent by the browser', { ...FORM, answers: [{ questionId: 0, optionId: 1, label: 'Acme GmbH' }] }],
    ['a record id sent by the browser', { ...FORM, answers: [{ questionId: 0, customerId: 'clx0cus00000000000000001' }] }],
    ['an extra key in the form', { ...FORM, offerId: 'x' }],
  ])('refuses %s', (_label, form) => {
    expect(fieldsOf(base({ form }))).not.toEqual({});
  });

  // ---------- T74 (R20-4): a form's message text is ignored by the server, so the schema does not bound it ----------
  const withText = (text: string, extra: Record<string, unknown> = {}) => ({
    conversationId: 'clx0conv0000000000000001',
    message: { id: 'msg_client_01', role: 'user', parts: [{ type: 'text', text }] },
    ...extra,
  });

  it.each([
    ['an empty text', ''],
    ['a text over 2000 characters', 'Notes: ' + 'x'.repeat(2000)],
  ])('T74: a form request with %s is accepted', (_label, text) => {
    const r = chatRequestSchema.safeParse(withText(text, { form: FORM }));
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues)).toBe(true);
  });

  it('T74: a form request with text of exactly 8000 characters is accepted', () => {
    const r = chatRequestSchema.safeParse(withText('x'.repeat(8000), { form: FORM }));
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues)).toBe(true);
  });

  it('T74: a form request with text over 8000 characters is refused as too_big at the text path', () => {
    const r = chatRequestSchema.safeParse(withText('x'.repeat(8001), { form: FORM }));
    expect(r.success, 'expected the request to be refused').toBe(false);
    if (r.success) return;
    expect(r.error.issues.some((i) => i.code === 'too_big' && i.path.join('.') === 'message.parts.0.text')).toBe(true);
  });

  it('T74: a typed message keeps its bounds (empty and over 2000 refused)', () => {
    expect(chatRequestSchema.safeParse(withText('')).success).toBe(false);
    expect(chatRequestSchema.safeParse(withText('x'.repeat(2001))).success).toBe(false);
    expect(chatRequestSchema.safeParse(withText('x'.repeat(2000))).success).toBe(true);
  });

  // ---------- T57: `choice` is removed; a form replaces it (ADR-0011). The choice cases are now refusal cases. ----------
  const refusedAsUnknownChoice = (input: unknown) => {
    const r = chatRequestSchema.safeParse(input);
    expect(r.success, 'expected the request to be refused').toBe(false);
    if (r.success) return;
    expect(r.error.issues.some((i) => i.code === 'unrecognized_keys' && (i as any).keys.includes('choice'))).toBe(true);
  };

  it('AC-08 / AC-12b: a choice in a saved Conversation is refused as an unknown key (it was accepted before T57)', () => {
    refusedAsUnknownChoice(base({ choice: CHOICE }));
  });

  it('AC-12b: a choice with conversationId null is refused as an unknown key', () => {
    refusedAsUnknownChoice(base({ choice: CHOICE }, null));
  });

  it('a choice together with an origin is refused as an unknown key', () => {
    refusedAsUnknownChoice(base({ choice: CHOICE, origin: 'DASHBOARD' }, null));
  });

  it.each([
    ['an empty offerId', { offerId: '', optionId: 1 }],
    ['an offerId over 64 characters', { offerId: 'x'.repeat(65), optionId: 1 }],
    ['a non-integer optionId', { offerId: CHOICE.offerId, optionId: 1.5 }],
    ['a negative optionId', { offerId: CHOICE.offerId, optionId: -1 }],
    ['an extra key in the choice', { ...CHOICE, label: 'Acme GmbH' }],
    ['a choice without optionId', { offerId: CHOICE.offerId }],
    ['a choice shape that used to be valid (64-character offerId, optionId 7)', { offerId: 'x'.repeat(64), optionId: 7 }],
  ])('refuses %s', (_label, choice) => {
    refusedAsUnknownChoice(base({ choice }));
  });

  it('a request with both a form and a choice is refused (the choice is unknown)', () => {
    refusedAsUnknownChoice(base({ form: FORM, choice: CHOICE }));
  });

  it('the schema no longer exports a choice schema', async () => {
    const mod = (await import('@/lib/validations/assistant-chat')) as Record<string, unknown>;
    expect(mod.chatChoiceSchema).toBeUndefined();
  });

  it('refuses origin or startedFrom on a saved Conversation', () => {
    expect(fieldsOf(base({ origin: 'DASHBOARD', startedFrom: 'DASHBOARD_PROMPT' })).origin).toBeDefined();
    expect(fieldsOf(base({ startedFrom: 'INVOICE_LIST' })).startedFrom).toBeDefined();
    expect(fieldsOf(base({ origin: 'TYPED' })).origin).toBeDefined();
  });

  it('AC-29: origin DASHBOARD needs startedFrom DASHBOARD_PROMPT, and the other way round', () => {
    expect(fieldsOf(base({ origin: 'DASHBOARD' }, null)).origin ?? fieldsOf(base({ origin: 'DASHBOARD' }, null)).startedFrom).toBeDefined();
    expect(fieldsOf(base({ origin: 'DASHBOARD', startedFrom: 'AI_SECTION' }, null))).not.toEqual({});
    expect(fieldsOf(base({ startedFrom: 'DASHBOARD_PROMPT' }, null))).not.toEqual({});
    expect(fieldsOf(base({ origin: 'TYPED', startedFrom: 'DASHBOARD_PROMPT' }, null))).not.toEqual({});
    expect(chatRequestSchema.safeParse(base({ origin: 'DASHBOARD', startedFrom: 'DASHBOARD_PROMPT' }, null)).success).toBe(true);
  });

  it('accepts every start point on a new Conversation, and TYPED as an origin', () => {
    for (const startedFrom of ['AI_SECTION', 'INVOICE_LIST', 'DASHBOARD_CREATE']) {
      expect(chatRequestSchema.safeParse(base({ startedFrom }, null)).success, startedFrom).toBe(true);
    }
    expect(chatRequestSchema.safeParse(base({ origin: 'TYPED' }, null)).success).toBe(true);
    expect(fieldsOf(base({ startedFrom: 'SOMEWHERE_ELSE' }, null))).not.toEqual({});
  });

  it('refuses origin PRESSED from the client', () => {
    expect(fieldsOf(base({ origin: 'PRESSED' }, null))).not.toEqual({});
  });

  it('refuses an unknown extra key', () => {
    expect(chatRequestSchema.safeParse(base({ record: 'clx0cus00000000000000001' })).success).toBe(false);
    expect(chatRequestSchema.safeParse(base({ choice: CHOICE, record: 'clx0cus00000000000000001' })).success).toBe(false);
  });
});
