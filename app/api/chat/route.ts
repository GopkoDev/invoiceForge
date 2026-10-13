// T31 (ai-assistant, AC-06, AC-09, AC-10, AC-10b, AC-11, AC-42; sad.md critical flow 1, ADR-0002): POST /api/chat.
// Fixed order: session, body, Conversation, allowance; then the turn streams, is saved, and a failure gives
// the slot back. A new Conversation is announced (data-conversation) only after its row is saved, so a turn
// that does not count never hands the client an id that does not exist (R-02). Every refusal before the
// stream is a JSON ActionFailure and nothing is counted.
// ai-chat-v2 T14 (critical flow 1, ADR-0003; AC-08, AC-08b, AC-10, AC-11, AC-12b, AC-29): a press is checked against
// its stored offer after the owner check and before the allowance; a valid one reserves the slot and claims the
// offer in one transaction, is pinned and resolved in code, and is saved with the stored label and origin PRESSED.
// A system-side failure gives the slot and the claim back together.
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
import { reserveMessageSlot } from '@/lib/services/assistant-usage/allowance';
import { checkChoice, reserveAndClaim, type CheckedChoice } from '@/lib/services/assistant-drafts/offers';
import { pinChoice } from '@/lib/services/assistant-drafts/pin';
import { resolveDraftRequest } from '@/lib/services/assistant-drafts/resolve';
import { recordTurnMetadata } from '@/lib/services/assistant-usage/turns';
import { loadHistory } from '@/lib/services/conversations/conversations';
import { saveTurn } from '@/lib/services/conversations/save-turn';
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
  error: 'This option is no longer available. Choose again or type your request.',
  details: { kind: 'CHOICE_UNAVAILABLE' },
} as const;
/** The 429 sentence, with the renewal time in the Freelancer's own zone (AC-10, spec §8 time-zone rule). */
const usedUpText = (renewsAt: string, timeZone: string, now: Date) =>
  `You've used today's 30 messages. They renew ${renewalWhen(renewsAt, timeZone, now)} your time. An AI client connected with a Personal key isn't affected.`;

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
  const { conversationId, choice, origin, startedFrom } = parsed.data;
  // A press is saved with the offer's stored label; the client's text is ignored (ADR-0003).
  let userText = parsed.data.message.parts[0].text;
  // The server sets the origin: PRESSED only from a valid choice; DASHBOARD only on a first message (schema).
  const userOrigin: MessageOrigin = choice ? 'PRESSED' : origin === 'DASHBOARD' ? 'DASHBOARD' : 'TYPED';

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

  // Checked before the allowance: an invalid press is unavailable even with the allowance used up.
  let checked: CheckedChoice | null = null;
  if (choice && conversationId) {
    checked = await checkChoice(actor, { conversationId, ...choice });
    if (!checked.ok) {
      // A system failure is "couldn't be completed", never "no longer available" (review 2026-10-13 R1-S3).
      return 'failed' in checked
        ? NextResponse.json(FAILED, { status: 503 })
        : NextResponse.json(CHOICE_UNAVAILABLE, { status: 409 });
    }
    userText = checked.option.label;
  }

  const startedAt = Date.now();
  const reservation = choice
    ? await reserveAndClaim(actor, new Date(startedAt), choice.offerId, choice.optionId)
    : await reserveMessageSlot(actor, new Date(startedAt));
  if (!reservation.ok) {
    // Another press claimed the offer first; the transaction took no slot.
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

  // The chosen record is pinned into the offer's request and resolved in code before the model writes (AC-10).
  let pinned: PinnedResolution | undefined;
  if (checked?.ok) {
    const { offer, option } = checked;
    const request = pinChoice(offer.request, offer.kind, offer.lineIndex, option.ref);
    const resolved = await resolveDraftRequest(actor, request, todayInZone(actor.timeZone)).catch(() => null);
    if (!resolved?.success) {
      await slot.release().catch(() => null);
      await recordTurnMetadata(actor, failedTurn(startedAt)).catch(() => undefined);
      return NextResponse.json(FAILED, { status: 503 });
    }
    pinned = { request, resolution: resolved.data };
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
    if (result.pendingOffer) {
      write({
        type: 'data-offer',
        id: result.pendingOffer.id,
        data: { offerId: result.pendingOffer.id },
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
        offer: result.pendingOffer ?? null,
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
