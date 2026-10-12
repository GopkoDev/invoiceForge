import 'server-only';
/* eslint-disable @typescript-eslint/no-explicit-any -- Mastra stream chunk payloads are untyped unions; each case reads its own fields */
import { RequestContext } from '@mastra/core/request-context';
import type { ModelMessage, UIMessageChunk } from 'ai';
import { chatAgent, MAX_STEPS, TURN_CONTEXT_KEY } from '@/lib/ai/agent';
import { MIXED_INSTRUCTION } from '@/lib/ai/instructions/refusal';
import { classifyMessage, type RouterTopic, type RouterTurn } from '@/lib/ai/router';
import { createTurnContext } from '@/lib/ai/turn-context';
import { isProviderFault } from '@/lib/ai/provider-fault';
import { issuesText } from '@/lib/ai/issue-text';
import { gatewayCostOf, sumCosts } from '@/lib/ai/gateway-cost';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import type { DraftIssue, DraftProposal, DraftRequest } from '@/lib/services/assistant-drafts/schema';
import type { ConversationMessageView } from '@/types/assistant/types';
import type { AppLink } from '@/lib/validations/assistant-chat';

/** Conversation history sent to the model (spec §6). */
export const HISTORY_LIMIT = 40;
/** The router sees only the last few turns, enough to resolve a short follow-up. */
const ROUTER_TURNS = 6;

const TOO_BROAD: Record<string, string> = {
  en: 'That question was too broad to answer in full in one message. Please ask a narrower one, for example about a single customer or period.',
  uk: 'Це запитання надто широке, щоб відповісти на нього повністю в одному повідомленні. Поставте, будь ласка, вужче, наприклад про одного клієнта або період.',
};

// The model ended the turn with no words, no card and no draft issues to explain (fix 2026-10-12): the reply
// is never empty. It is a reply the system produced, so it counts (spec §1 D2); only system-side failures do not.
const NO_WORDS: Record<string, string> = {
  en: 'I could not answer that. Please rephrase your message or add the missing detail, for example which Customer, invoice or amount you mean.',
  uk: 'Я не зміг на це відповісти. Перефразуйте, будь ласка, повідомлення або додайте деталь, якої бракує, наприклад, якого клієнта, який інвойс чи яку суму ви маєте на увазі.',
};

export type TurnOutcome = 'ANSWERED' | 'CAPPED' | 'FAILED';

export interface TurnResult {
  outcome: TurnOutcome;
  failure?: 'PROVIDER' | 'SYSTEM';
  topic: RouterTopic | null;
  steps: number;
  toolNames: string[];
  usage: { inputTokens: number | null; outputTokens: number | null };
  /** Gateway-reported USD cost of every model call of the turn, router included; 0 when none is reported. */
  costUsd: number;
  pendingCard?: { id: string; request: DraftRequest; proposal: DraftProposal };
  links: AppLink[];
  text: string;
}

export interface RunTurnInput {
  actor: ActingFreelancer;
  today: string;
  history: ConversationMessageView[];
  message: string;
  signal: AbortSignal;
  origin?: string;
}

const EMPTY_USAGE = { inputTokens: null, outputTokens: null };

function textOf(message: ConversationMessageView): string {
  return message.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('');
}

function toModelTurns(history: ConversationMessageView[]): RouterTurn[] {
  return history.map((m) => ({ role: m.role, content: textOf(m) })).filter((m) => m.content.length > 0);
}

function isAppLink(value: unknown): value is AppLink {
  if (!value || typeof value !== 'object') return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === 'invoice' || kind === 'page';
}

/** Links a tool answer names: its `links`, plus the pages `find_in_app` found. */
function linksFromToolResult(toolName: string, result: unknown): AppLink[] {
  if (!result || typeof result !== 'object') return [];
  const answer = result as { links?: unknown; pages?: unknown };
  const links: AppLink[] = Array.isArray(answer.links) ? answer.links.filter(isAppLink) : [];
  if (toolName === 'find_in_app' && Array.isArray(answer.pages)) {
    for (const p of answer.pages) {
      const page = (p as { page?: unknown }).page;
      // find_in_app knows no sender profile, and the bank-accounts page needs one: link the profiles list
      // instead, where every profile's accounts are (fix 2026-10-12, AC-07).
      if (page === 'sender-profile-bank-accounts') links.push({ kind: 'page', page: 'sender-profiles' });
      else if (typeof page === 'string') links.push({ kind: 'page', page } as AppLink);
    }
  }
  return links;
}

function pushUnique(links: AppLink[], more: AppLink[]) {
  for (const link of more) {
    const key = JSON.stringify(link);
    if (!links.some((l) => JSON.stringify(l) === key)) links.push(link);
  }
}

function chunkStream(run: (emit: (chunk: UIMessageChunk) => void) => Promise<void>): AsyncIterable<UIMessageChunk> {
  // start() runs eagerly and enqueue never blocks, so the result settles even if nobody reads.
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      try {
        await run((chunk) => controller.enqueue(chunk));
      } finally {
        controller.close();
      }
    },
  }) as unknown as AsyncIterable<UIMessageChunk>;
}

function failed(failure: 'PROVIDER' | 'SYSTEM', topic: RouterTopic | null, partial?: Partial<TurnResult>): TurnResult {
  return { outcome: 'FAILED', failure, topic, steps: 0, toolNames: [], usage: EMPTY_USAGE, costUsd: 0, links: [], text: '', ...partial };
}

/** A fault of the model provider is PROVIDER (AI_UNAVAILABLE); anything else is ours, SYSTEM (R-05). */
const failureOf = (error: unknown): 'PROVIDER' | 'SYSTEM' => (isProviderFault(error) ? 'PROVIDER' : 'SYSTEM');

function emptyStream(): AsyncIterable<UIMessageChunk> {
  return chunkStream(async () => {});
}

/**
 * Runs one chat turn: the topic router first, then (unless off-topic) the tool agent under the
 * 8-step cap. Never throws; a failure is a FAILED result the route turns into a released slot.
 */
export async function runTurn(input: RunTurnInput): Promise<{ stream: AsyncIterable<UIMessageChunk>; result: Promise<TurnResult> }> {
  const history = toModelTurns(input.history.slice(-HISTORY_LIMIT));

  let verdict;
  try {
    verdict = await classifyMessage({ message: input.message, recentTurns: history.slice(-ROUTER_TURNS) });
  } catch (error) {
    return { stream: emptyStream(), result: Promise.resolve(failed(failureOf(error), null)) };
  }
  const topic = verdict.topic;
  const routerCost = verdict.costUsd ?? 0;

  if (topic === 'OFF_TOPIC') {
    const refusal = verdict.refusal ?? '';
    const stream = chunkStream(async (emit) => {
      emit({ type: 'text-start', id: 'refusal' });
      emit({ type: 'text-delta', id: 'refusal', delta: refusal });
      emit({ type: 'text-end', id: 'refusal' });
    });
    const result: TurnResult = {
      outcome: 'ANSWERED',
      topic,
      steps: 0,
      toolNames: [],
      usage: EMPTY_USAGE,
      costUsd: sumCosts([routerCost]),
      links: [],
      text: refusal,
    };
    return { stream, result: Promise.resolve(result) };
  }

  const turn = createTurnContext({ actor: input.actor, today: input.today, origin: input.origin, draftIntent: verdict.intent === 'draft' });
  const requestContext = new RequestContext();
  requestContext.set(TURN_CONTEXT_KEY, turn);

  const messages: ModelMessage[] = [
    ...(topic === 'MIXED' ? [{ role: 'system' as const, content: MIXED_INSTRUCTION }] : []),
    ...history,
    { role: 'user' as const, content: input.message },
  ];

  let resolveResult!: (r: TurnResult) => void;
  const result = new Promise<TurnResult>((resolve) => {
    resolveResult = resolve;
  });

  const stream = chunkStream(async (emit) => {
    const toolNames: string[] = [];
    const links: AppLink[] = [];
    let steps = 0;
    let lastFinish: string | undefined;
    let text = '';
    // The first fault seen; `true` when the stream reports one without an error value (a tripwire).
    let fault: unknown = null;
    const costs = [routerCost];
    let usage = EMPTY_USAGE as TurnResult['usage'];
    let openText: string | null = null;
    // The last propose_draft ISSUES answer, for the fallback words when the model writes none.
    let draftIssues: DraftIssue[] = [];

    const closeText = () => {
      if (openText) emit({ type: 'text-end', id: openText });
      openText = null;
    };

    try {
      // The chat instructions come from the agent itself; only per-turn additions travel here (R-19).
      const output = await chatAgent.stream(messages, { maxSteps: MAX_STEPS, abortSignal: input.signal, requestContext });
      const reader = output.fullStream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value as { type: string; payload?: unknown };
        const p = (chunk.payload ?? {}) as any;
        switch (chunk.type) {
          case 'text-delta':
            if (!openText) {
              openText = `text-${steps}`;
              emit({ type: 'text-start', id: openText });
            }
            text += p.text;
            emit({ type: 'text-delta', id: openText, delta: p.text });
            break;
          // Tool calls and raw tool answers stay on the server: the client gets the text, the links and the
          // card (openapi /api/chat 200, R-14).
          case 'tool-call':
            closeText();
            toolNames.push(p.toolName);
            break;
          case 'tool-result':
            pushUnique(links, linksFromToolResult(p.toolName, p.result));
            // Only the last propose_draft answer counts: a later CARD clears earlier issues (review R6-2).
            if (p.toolName === 'propose_draft') draftIssues = p.result?.kind === 'ISSUES' ? p.result.issues : [];
            break;
          case 'step-finish':
            closeText();
            steps += 1;
            lastFinish = p.stepResult?.reason ?? p.output?.reason ?? p.reason;
            costs.push(gatewayCostOf(p.metadata?.providerMetadata));
            break;
          case 'error':
            fault ??= p.error ?? true;
            break;
          case 'tripwire':
            fault ??= true;
            break;
        }
      }
      closeText();
      try {
        const u = await output.usage;
        usage = { inputTokens: u?.inputTokens ?? null, outputTokens: u?.outputTokens ?? null };
      } catch {
        // usage is optional metadata
      }
      if (output.error) fault ??= output.error;
    } catch (error) {
      fault ??= error ?? true;
    }

    const costUsd = sumCosts(costs);
    if (fault !== null) {
      resolveResult(failed(failureOf(fault), topic, { steps, toolNames, usage, costUsd, text }));
      return;
    }

    if (text.trim() === '' && draftIssues.length > 0 && !turn.pending.card) {
      // AC-19 "the chat says so": a reply of links alone tells the Freelancer nothing (fix 2026-10-12).
      const fallback = issuesText(draftIssues, verdict.language);
      emit({ type: 'text-start', id: 'issues' });
      emit({ type: 'text-delta', id: 'issues', delta: fallback });
      emit({ type: 'text-end', id: 'issues' });
      text = fallback;
    }

    const capped = steps >= MAX_STEPS && lastFinish === 'tool-calls';
    if (text.trim() === '' && !turn.pending.card && !capped) {
      const sentence = NO_WORDS[verdict.language] ?? NO_WORDS.en;
      emit({ type: 'text-start', id: 'no-words' });
      emit({ type: 'text-delta', id: 'no-words', delta: sentence });
      emit({ type: 'text-end', id: 'no-words' });
      text = sentence;
    }
    if (capped) {
      const sentence = TOO_BROAD[verdict.language] ?? TOO_BROAD.en;
      const addition = `${text ? '\n\n' : ''}${sentence}`;
      emit({ type: 'text-start', id: 'capped' });
      emit({ type: 'text-delta', id: 'capped', delta: addition });
      emit({ type: 'text-end', id: 'capped' });
      text += addition;
    }
    resolveResult({
      outcome: capped ? 'CAPPED' : 'ANSWERED',
      topic,
      steps,
      toolNames,
      usage,
      costUsd,
      pendingCard: turn.pending.card ?? undefined,
      links,
      text,
    });
  });

  return { stream, result };
}
