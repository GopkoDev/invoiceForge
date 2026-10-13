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
  it.each(['press', 'dashboardPrompt', 'createWithAiFromDashboard'])('AC-08 / AC-29: the %s example validates against ChatRequest and parses with chatRequestSchema', async (name) => {
    const op = await operation();
    const example = op.requestBody.content['application/json'].examples[name].value;
    const validate = validatorFor(op.requestBody.content['application/json'].schema);

    expect(validate(example), JSON.stringify(validate.errors)).toBe(true);
    const parsed = chatRequestSchema.safeParse(example);
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(example);
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
      error: 'This option is no longer available. Choose again or type your request.',
      details: { kind: 'CHOICE_UNAVAILABLE' },
    });
  });
});

describe('chatRequestSchema: field combinations (ChatRequest)', () => {
  const fieldsOf = (input: unknown) => {
    const r = chatRequestSchema.safeParse(input);
    expect(r.success, 'expected the request to be refused').toBe(false);
    if (r.success) return {} as Record<string, string[]>;
    return r.error.flatten().fieldErrors as Record<string, string[]>;
  };

  it('AC-08: accepts a choice in a saved Conversation', () => {
    expect(chatRequestSchema.safeParse(base({ choice: CHOICE })).success).toBe(true);
  });

  it('AC-12b: refuses a choice with conversationId null, with the exact sentence on `choice`', () => {
    expect(fieldsOf(base({ choice: CHOICE }, null)).choice).toEqual(['A choice can only be sent in a saved conversation.']);
  });

  it('refuses a choice together with an origin', () => {
    const f = fieldsOf(base({ choice: CHOICE, origin: 'DASHBOARD' }));
    expect(Object.keys(f).length).toBeGreaterThan(0);
    expect(f.choice ?? f.origin).toBeDefined();
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

  it.each([
    ['an empty offerId', { offerId: '', optionId: 1 }],
    ['an offerId over 64 characters', { offerId: 'x'.repeat(65), optionId: 1 }],
    ['a non-integer optionId', { offerId: CHOICE.offerId, optionId: 1.5 }],
    ['a string optionId', { offerId: CHOICE.offerId, optionId: '1' }],
    ['a negative optionId', { offerId: CHOICE.offerId, optionId: -1 }],
    ['an optionId above 7', { offerId: CHOICE.offerId, optionId: 8 }],
    ['an extra key in the choice', { ...CHOICE, label: 'Acme GmbH' }],
    ['a choice without optionId', { offerId: CHOICE.offerId }],
  ])('refuses %s', (_label, choice) => {
    expect(fieldsOf(base({ choice }))).not.toEqual({});
  });

  it('accepts optionId 0 and 7 and an offerId of 64 characters', () => {
    for (const optionId of [0, 7]) expect(chatRequestSchema.safeParse(base({ choice: { ...CHOICE, optionId } })).success).toBe(true);
    expect(chatRequestSchema.safeParse(base({ choice: { offerId: 'x'.repeat(64), optionId: 0 } })).success).toBe(true);
  });

  it('refuses an unknown extra key', () => {
    expect(chatRequestSchema.safeParse(base({ record: 'clx0cus00000000000000001' })).success).toBe(false);
    expect(chatRequestSchema.safeParse(base({ choice: CHOICE, record: 'clx0cus00000000000000001' })).success).toBe(false);
  });
});
