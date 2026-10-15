// T31 (ai-assistant, AC-06, AC-09, AC-10, AC-10b, AC-11, AC-42; sad.md critical flow 1, ADR-0002): POST /api/chat.
// Fixed order: session, body, Conversation, allowance; then the turn streams, is saved, and a failure gives
// the slot back. A new Conversation is announced (data-conversation) only after its row is saved, so a turn
// that does not count never hands the client an id that does not exist (R-02). Every refusal before the
// stream is a JSON ActionFailure and nothing is counted.
// ai-chat-v2 T57 (critical flow 1, ADR-0011 "Submit"; AC-08, AC-10, AC-11, AC-12b, AC-38): a sent Question form is
// checked (checkForm) after the owner check and before the allowance; a valid one reserves the slot and claims the
// form with its answers in one transaction, its message is composed from the stored labels (the client text is
// ignored), the draft answers are pinned and resolved in code, and it is saved with origin FORM. A form with no draft
// action to run reaches the turn as a prior ask_user step. A system-side failure gives the slot and the claim back.
import { createId } from '@paralleldrive/cuid2';
import { NextResponse, type NextRequest } from 'next/server';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageChunk,
} from 'ai';
import { actingFreelancerForRoute } from '@/lib/helpers/session-actor';
import { todayInZone } from '@/lib/helpers/calendar-day';
import { renewalWhen } from '@/lib/helpers/allowance-renewal';
import { chatRequestSchema } from '@/lib/validations/assistant-chat';
import { CHOICE_UNAVAILABLE_MESSAGE } from '@/types/result';
import { reserveMessageSlot } from '@/lib/services/assistant-usage/allowance';
import { checkForm, reserveAndClaimForm, type CheckedForm } from '@/lib/services/assistant-drafts/forms';
import { pinAnswers } from '@/lib/services/assistant-drafts/form-pin';
import { draftRequestSchema } from '@/lib/services/assistant-drafts/schema';
import { answerText, composeAnswerMessage, defaultPrompt } from '@/lib/validations/form-answers';
import { resolveDraftRequest } from '@/lib/services/assistant-drafts/resolve';
import { recordTurnMetadata } from '@/lib/services/assistant-usage/turns';
import { loadHistory } from '@/lib/services/conversations/conversations';
import { saveTurn } from '@/lib/services/conversations/save-turn';
import { CHAT_PER_MINUTE_MAX } from '@/lib/ai/limits';
import { createLimitStore } from '@/lib/security/limits/limit-store';
import { runTurn } from '@/lib/ai/run-turn';
import type { PinnedResolution } from '@/lib/ai/turn-context';
import {
  assistantPartsOf,
  chatOutcomeOf,
  chatValidationFailure,
} from '@/lib/ai/stream';
// Registers the chat agent with Mastra, so its runs are traced through the metadata-only processor (ADR-0004).
import '@/lib/ai/mastra';
import type {
  AssistantTurnMetadata,
  ConversationMessageView,
  MessageOrigin,
} from '@/types/assistant/types';

export const runtime = 'nodejs';

const NOT_FOUND = {
  success: false,
  code: 'NOT_FOUND',
  error: "This conversation can't be found.",
} as const;
const FAILED = {
  success: false,
  code: 'FAILED',
  error: "The reply couldn't be completed. Try again.",
} as const;
/** One body for every cause a press cannot be applied (AC-12b, AC-13): outdated, foreign, never existed, changed. */
const CHOICE_UNAVAILABLE = {
  success: false,
  code: 'CONFLICT',
  error: CHOICE_UNAVAILABLE_MESSAGE,
  details: { kind: 'CHOICE_UNAVAILABLE' },
} as const;
/** The 429 sentence, with the renewal time in the Freelancer's own zone (AC-10, spec §8 time-zone rule). */
const usedUpText = (renewsAt: string, timeZone: string, now: Date) =>
  `You've used today's 30 messages. They renew ${renewalWhen(renewsAt, timeZone, now)} your time. An AI client connected with a Personal key isn't affected.`;

/** The per-minute refusal (T100, SEC-M-01 c): distinct from the daily allowance, nothing reserved or counted. */
const TOO_FAST = {
  success: false,
  code: 'TOO_FAST',
  error: "You're sending messages too quickly. Try again in a minute.",
} as const;

const failedTurn = (startedAt: number): AssistantTurnMetadata => ({
  topic: null,
  outcome: 'FAILED',
  counted: false,
  steps: 0,
  toolNames: [],
  durationMs: Date.now() - startedAt,
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
});

export async function POST(request: NextRequest) {
  const session = await actingFreelancerForRoute(() =>
    NextResponse.json(FAILED, { status: 503 })
  );
  if (!session.ok) return session.response;
  const actor = session.actor;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: 'VALIDATION',
        error: 'Please fix the highlighted fields.',
      },
      { status: 400 }
    );
  }
  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json(chatValidationFailure(parsed.error), {
      status: 400,
    });
  const { conversationId, form, startedFrom } = parsed.data;
  // A form Send is saved with the message composed from the stored labels; the client's text is ignored (ADR-0003).
  let userText = parsed.data.message.parts[0].text;
  // The server sets the origin: FORM only from a valid form; a request can only be TYPED (DASHBOARD is refused by the schema).
  const userOrigin: MessageOrigin = form ? 'FORM' : 'TYPED';

  // Owner check (and the history, read server-side): unknown and foreign answer alike.
  let history: ConversationMessageView[] = [];
  if (conversationId) {
    const loaded = await loadHistory(actor, conversationId);
    if (!loaded.success) {
      return loaded.code === 'NOT_FOUND'
        ? NextResponse.json(NOT_FOUND, { status: 404 })
        : NextResponse.json(FAILED, { status: 503 });
    }
    history = loaded.data;
  }

  // Checked before the allowance: an invalid form is unavailable even with the allowance used up.
  let checked: CheckedForm | null = null;
  if (form && conversationId) {
    checked = await checkForm(actor, { conversationId, form });
    if (!checked.ok) {
      // A system failure is "couldn't be completed", never "no longer available" (review 2026-10-13 R1-S3).
      if (checked.kind === 'FAILED') return NextResponse.json(FAILED, { status: 503 });
      if (checked.kind === 'INVALID')
        return NextResponse.json(
          {
            success: false,
            code: 'VALIDATION',
            error: 'Please fix the highlighted fields.',
            fieldErrors: checked.fieldErrors,
          },
          { status: 400 }
        );
      return NextResponse.json(CHOICE_UNAVAILABLE, { status: 409 });
    }
    userText = composeAnswerMessage(checked.form.questions, checked.answers);
  }

  const startedAt = Date.now();
  // Before any slot or model call: the per-minute limit, counted and recorded under the shared store's key lock so
  // parallel sends cannot overrun it. A refusal writes nothing; a store failure fails closed (T104).
  let admitted: boolean;
  try {
    admitted = await createLimitStore().withKeyLock('CHAT_MESSAGE', actor.userId, async (limit) => {
      if ((await limit.countInWindow()) >= CHAT_PER_MINUTE_MAX) return false;
      await limit.record('REQUESTED', { userId: actor.userId });
      return true;
    });
  } catch {
    return NextResponse.json(FAILED, { status: 503 });
  }
  if (!admitted) return NextResponse.json(TOO_FAST, { status: 429 });
  const reservation = form
    ? await reserveAndClaimForm(actor, new Date(startedAt), form.formId, form.answers)
    : await reserveMessageSlot(actor, new Date(startedAt));
  if (!reservation.ok) {
    // Another Send claimed the form first; the transaction took no slot.
    if ('claimLost' in reservation) return NextResponse.json(CHOICE_UNAVAILABLE, { status: 409 });
    if ('usedUp' in reservation) {
      await recordTurnMetadata(actor, {
        topic: null,
        outcome: 'ALLOWANCE_USED_UP',
        counted: false,
        steps: 0,
        toolNames: [],
        durationMs: Date.now() - startedAt,
        inputTokens: null,
        outputTokens: null,
        // No model call was made.
        costUsd: 0,
      });
      return NextResponse.json(
        {
          success: false,
          code: 'RATE_LIMITED',
          error: usedUpText(reservation.usedUp.renewsAt, actor.timeZone, new Date()),
          details: reservation.usedUp,
        },
        { status: 429 }
      );
    }
    return NextResponse.json(FAILED, { status: 503 });
  }

  const slot = reservation;

  // The picked records are pinned into the form's request and resolved in code before the model writes (AC-10). A
  // form that holds no complete draft request reaches the turn as a prior ask_user step with the answers as data.
  let pinned: PinnedResolution | undefined;
  let priorAnswers: Array<Record<string, unknown>> | undefined;
  let priorRequest: Record<string, unknown> | undefined;
  if (checked?.ok) {
    const { form: stored, answers } = checked;
    const today = todayInZone(actor.timeZone);
    if (stored.request) {
      const request = pinAnswers(stored.request, stored.questions, answers, { today });
      const complete = draftRequestSchema.safeParse(request);
      if (complete.success) {
        const resolved = await resolveDraftRequest(actor, complete.data, today).catch(() => null);
        if (!resolved?.success) {
          await slot.release().catch(() => null);
          await recordTurnMetadata(actor, failedTurn(startedAt)).catch(() => undefined);
          return NextResponse.json(FAILED, { status: 503 });
        }
        pinned = { request: complete.data, resolution: resolved.data };
      }
    }
    if (!pinned) {
      // A picked record travels as its id under the propose_draft field it fills, so it is never matched by name again (T71).
      const ID_KEYS = { CUSTOMER: ['customerId', 'customerId'], SENDER_PROFILE: ['senderProfileId', 'senderProfileId'], BANK_ACCOUNT: ['bankAccount', 'bankAccountId'], PRODUCT: ['productId', 'productId'] } as const;
      priorAnswers = stored.questions
        .filter((q) => answers.some((a) => a.questionId === q.questionId))
        .map((q) => {
          const answer = answers.find((a) => a.questionId === q.questionId);
          const keys = q.field in ID_KEYS ? ID_KEYS[q.field as keyof typeof ID_KEYS] : null;
          const option = answer && 'optionId' in answer ? q.options.find((o) => o.optionId === answer.optionId) : null;
          const id = keys && option ? (option.ref as Record<string, unknown>)[keys[1]] : null;
          return {
            question: q.prompt ?? defaultPrompt(q.field, q.lineIndex),
            answer: answer ? answerText(q, answer) : '',
            ...(keys && typeof id === 'string' ? { [keys[0]]: id, ...(q.field === 'PRODUCT' ? { lineIndex: q.lineIndex ?? 0 } : {}) } : {}),
          };
        });
      if (stored.request) priorRequest = pinAnswers(stored.request, stored.questions, answers, { today }) as Record<string, unknown>;
    }
  }
  // A new Conversation's id (a cuid, like every record id) is announced only once its row is saved (R-02).
  const conversation = {
    id: conversationId ?? createId(),
    isNew: conversationId === null,
  };

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        await produce(writer);
      } catch {
        // Anything unexpected is a system-side failure: give the slot back.
        const restored = await slot.release().catch(() => null);
        await recordTurnMetadata(actor, failedTurn(startedAt)).catch(
          () => undefined
        );
        writer.write({
          type: 'data-outcome',
          data: { outcome: 'COULD_NOT_COMPLETE', counted: false },
          transient: true,
        } as UIMessageChunk);
        if (restored)
          writer.write({
            type: 'data-allowance',
            data: restored,
            transient: true,
          } as UIMessageChunk);
      }
    },
    onError: () => FAILED.error,
  });

  async function produce(writer: { write: (chunk: UIMessageChunk) => void }) {
    const write = (chunk: unknown) => writer.write(chunk as UIMessageChunk);
    write({ type: 'data-allowance', data: slot.state, transient: true });

    const { stream: turnStream, result: resultPromise } = await runTurn({
      actor,
      today: todayInZone(actor.timeZone),
      history,
      message: userText,
      // Not request.signal: a client that disconnects mid-stream does not stop the turn. It completes
      // server-side, is saved and counted (a disconnect is not a system-side failure, spec §1 D2).
      signal: new AbortController().signal,
      origin: request.nextUrl.origin,
      pinned,
      ...(priorAnswers ? { priorAnswers, ...(priorRequest ? { priorRequest } : {}) } : {}),
      ...(checked?.ok && checked.form.request ? { draftForm: true } : {}),
    });
    for await (const chunk of turnStream) write(chunk);
    const result = await resultPromise;

    for (const link of result.links) write({ type: 'data-link', data: link });
    if (result.pendingCard) {
      write({
        type: 'data-draft-card',
        id: result.pendingCard.id,
        data: { cardId: result.pendingCard.id },
      });
    }
    // At most one per reply, after the text and before the outcome; the island reads its labels afterwards.
    if (result.pendingForm) {
      write({
        type: 'data-offer',
        id: result.pendingForm.id,
        data: { offerId: result.pendingForm.id },
      });
    }

    let { outcome, counted } = chatOutcomeOf(result);
    const turn: AssistantTurnMetadata = {
      topic: result.topic,
      outcome: result.outcome,
      counted,
      steps: result.steps,
      toolNames: result.toolNames,
      durationMs: Date.now() - startedAt,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd: result.costUsd,
    };

    if (counted) {
      // Saved before the stream closes so a serverless function is not frozen mid-write.
      const saved = await saveTurn(actor, {
        conversation,
        ...(conversation.isNew && startedFrom ? { startedFrom } : {}),
        userText,
        userOrigin,
        assistantMessageId: createId(),
        assistantParts: assistantPartsOf(result),
        form: result.pendingForm ?? null,
        turn,
        proposedCard: result.pendingCard,
      });
      if (!saved.success) {
        // NOT_FOUND: the Freelancer deleted the Conversation while the answer streamed. The answer was
        // delivered and saveTurn already recorded the counted turn, so the slot is kept (security M-01).
        if (saved.code !== 'NOT_FOUND') {
          outcome = 'COULD_NOT_COMPLETE';
          counted = false;
        }
      } else if (conversation.isNew) {
        // Only now does the row exist: a turn that does not count never hands the client an unsaved id.
        write({
          type: 'data-conversation',
          data: { conversationId: saved.data.conversationId, title: saved.data.title },
          transient: true,
        });
      }
    }
    if (!counted) {
      const restored = await slot.release();
      await recordTurnMetadata(actor, {
        ...turn,
        outcome: 'FAILED',
        counted: false,
      });
      write({
        type: 'data-outcome',
        data: { outcome, counted },
        transient: true,
      });
      write({ type: 'data-allowance', data: restored, transient: true });
      return;
    }
    write({
      type: 'data-outcome',
      data: { outcome, counted },
      transient: true,
    });
  }

  return createUIMessageStreamResponse({ stream });
}
