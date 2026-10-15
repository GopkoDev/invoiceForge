// ai-chat-v2 T04 (AC-12b, AC-26; contracts/server-actions.md §ActionResult changes + §Shared types): the two new
// ActionErrorDetails kinds, the one uniform "no longer available" sentence, and the offer/origin/start-point types.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { CHOICE_UNAVAILABLE_MESSAGE, fail, type ActionErrorDetails } from '@/types/result';
import type {
  ChoiceOfferKind,
  ChoiceOfferState,
  ConversationMessageView,
  ConversationStartPoint,
  LinkedInvoiceState,
  MessageOrigin,
  FormQuestionView,
  FormView,
} from '@/types/assistant/types';

describe('ai-chat-v2 shared result and assistant types (T04)', () => {
  // T51 (spec §1 F7, openapi 0.3.0): the sentence now names the form, the same for every refused Send.
  it('the unavailable sentence is the contract sentence, the same for every refused press', () => {
    expect(CHOICE_UNAVAILABLE_MESSAGE).toBe('This form is no longer available. Answer the latest questions or type your request.');
    const refusal = fail('CONFLICT', CHOICE_UNAVAILABLE_MESSAGE, { details: { kind: 'CHOICE_UNAVAILABLE' } });
    expect(refusal).toEqual({
      success: false,
      code: 'CONFLICT',
      error: 'This form is no longer available. Answer the latest questions or type your request.',
      details: { kind: 'CHOICE_UNAVAILABLE' },
    });
  });

  it('ActionErrorDetails holds CHOICE_UNAVAILABLE and ALREADY_ISSUED with the invoice state', () => {
    const invoice: LinkedInvoiceState = { state: 'ISSUED', invoiceId: 'inv-1', invoiceNumber: 'INV-0001', status: 'pending' };
    const details: ActionErrorDetails[] = [{ kind: 'CHOICE_UNAVAILABLE' }, { kind: 'ALREADY_ISSUED', invoice }];
    expect(details.map((d) => d.kind)).toEqual(['CHOICE_UNAVAILABLE', 'ALREADY_ISSUED']);
    expectTypeOf<Extract<ActionErrorDetails, { kind: 'ALREADY_ISSUED' }>>().toEqualTypeOf<{
      kind: 'ALREADY_ISSUED';
      invoice: LinkedInvoiceState;
    }>();
    expectTypeOf<Extract<ActionErrorDetails, { kind: 'CHOICE_UNAVAILABLE' }>>().toEqualTypeOf<{ kind: 'CHOICE_UNAVAILABLE' }>();
  });

  it('the offer, origin and start-point unions match the contract', () => {
    expectTypeOf<ChoiceOfferKind>().toEqualTypeOf<'CUSTOMER' | 'SENDER_PROFILE' | 'CURRENCY' | 'BANK_ACCOUNT' | 'PRODUCT' | 'FORM'>();
    expectTypeOf<ChoiceOfferState>().toEqualTypeOf<'OPEN' | 'CHOSEN' | 'CLOSED'>();
    expectTypeOf<MessageOrigin>().toEqualTypeOf<'TYPED' | 'PRESSED' | 'DASHBOARD' | 'FORM'>();
    expectTypeOf<ConversationStartPoint>().toEqualTypeOf<'AI_SECTION' | 'INVOICE_LIST' | 'DASHBOARD_PROMPT' | 'DASHBOARD_CREATE'>();
  });

  it('FormView sent to the browser carries only optionId + label (+ optional detail) per option: no record reference, no stored request', () => {
    expectTypeOf<FormQuestionView['options'][number]>().toEqualTypeOf<{ optionId: number; label: string; detail?: string }>();
    expectTypeOf<keyof FormView>().toEqualTypeOf<'formId' | 'state' | 'questions' | 'answers' | 'currency'>();
    const view: FormView = {
      formId: 'form-1',
      state: 'OPEN',
      questions: [
        {
          questionId: 0,
          field: 'CUSTOMER',
          lineIndex: null,
          prompt: null,
          options: [{ optionId: 0, label: 'Acme Corp (billing@acme.example.test)' }],
          input: 'NONE',
          required: true,
          skippable: false,
          matchCount: null,
        },
      ],
      answers: null,
    };
    expect(Object.keys(view.questions[0].options[0]).sort()).toEqual(['label', 'optionId']);
  });

  it('ConversationMessageView gains origin and the data-offer part', () => {
    expectTypeOf<ConversationMessageView['origin']>().toEqualTypeOf<MessageOrigin | null>();
    const message: ConversationMessageView = {
      id: 'm1',
      role: 'assistant',
      origin: null,
      parts: [{ type: 'data-offer', id: 'offer-1', data: { offerId: 'offer-1' } }],
      createdAt: '2026-10-13T10:00:00.000Z',
    };
    expect(message.parts[0].type).toBe('data-offer');
  });
});
