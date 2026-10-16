// The e2e chat model (T35). Selected by getChatModel() ONLY when AI_CHAT_MODEL === 'stub:e2e' AND
// E2E === '1' (both set only by tests/e2e/support/start-app-server.mjs); no real provider is called.
// Scripted by the Freelancer's last message:
//   - topic router call (doGenerate): always an in-scope English verdict;
//   - "invoice Acme for 20 hours of consulting at $50": a propose_draft call, then a short answer;
//   - "where do I change the logo ...": a find_in_app call, then a short answer (the app turns the
//     tool result into the structured link);
//   - "invoice acme for 20 hours at $50" (ai-chat-v2 T30): a USD propose_draft call, then a question when the
//     resolver reported issues (the reply's Offered choices are built in code from them);
//   - a pressed choice (the pinned propose_draft result is already in the prompt): a short answer;
//   - "how do payment reminders work" (ai-chat-v2 T30, AC-33): several sentences streamed in three bursts,
//     PAUSE_MS apart, so the words visibly arrive over time;
//   - anything else: a one-line text answer.
import { MockLanguageModelV4 } from 'ai/test';

type StreamPart = Parameters<ReadableStreamDefaultController<unknown>['enqueue']>[0];

export const E2E_STUB_MODEL_ID = 'stub:e2e';

type Prompt = Array<{ role: string; content: unknown }>;

const USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const stop = { unified: 'stop', raw: 'stop' } as const;
const toolCalls = { unified: 'tool-calls', raw: 'tool-calls' } as const;

function lastUserText(prompt: Prompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const m = prompt[i];
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    return (m.content as Array<{ type: string; text?: string }>)
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join(' ');
  }
  return '';
}

const afterToolResult = (prompt: Prompt) => prompt[prompt.length - 1]?.role === 'tool';
/** The propose_draft answer in the last tool message reported issues rather than a card. */
const toolReportedIssues = (prompt: Prompt) => JSON.stringify(prompt[prompt.length - 1]?.content ?? '').includes('ISSUES');

/** The multi-sentence reply of AC-33, in three bursts. */
export const STREAMED_REPLY = [
  'Payment reminders are e-mails you send to a Customer about an unpaid invoice. ',
  'You can send one from the invoice once it is issued and its due date has passed. ',
  'Each reminder repeats the amount due, the due date and how to pay.',
];
const PAUSE_MS = 400;

function plan(prompt: Prompt):
  | { kind: 'text'; text: string }
  | { kind: 'bursts'; bursts: string[] }
  | { kind: 'tool'; toolName: string; input: unknown } {
  const said = lastUserText(prompt).toLowerCase();
  const draft = said.includes('invoice acme for 20 hours');
  const usdDraft = said.includes('invoice acme for 20 hours at $50');
  const where = said.includes('logo');
  if (afterToolResult(prompt)) {
    if (toolReportedIssues(prompt)) return { kind: 'text', text: 'Which one do you mean? Choose below.' };
    return {
      kind: 'text',
      text: draft
        ? 'I prepared a draft for Acme Corp. Check the card, then press Create draft.'
        : where
          ? 'You can set the logo on your sender profile.'
          : 'I prepared the draft. Check the card, then press Create draft.',
    };
  }
  if (said.includes('how do payment reminders work')) return { kind: 'bursts', bursts: STREAMED_REPLY };
  if (usdDraft) {
    return {
      kind: 'tool',
      toolName: 'propose_draft',
      input: {
        customer: 'Acme',
        currency: 'USD',
        lines: [{ description: 'consulting', quantity: '20', unit: 'hours', price: '50' }],
      },
    };
  }
  if (draft) {
    return {
      kind: 'tool',
      toolName: 'propose_draft',
      input: {
        customer: 'Acme',
        lines: [{ description: 'consulting', quantity: '20', unit: 'hours', price: '50' }],
      },
    };
  }
  if (where) return { kind: 'tool', toolName: 'find_in_app', input: { topic: 'logo' } };
  return { kind: 'text', text: 'Here is a short answer from the stub model.' };
}

export function createE2eStubModel() {
  return new MockLanguageModelV4({
    modelId: E2E_STUB_MODEL_ID,
    // The topic router asks for a JSON verdict.
    doGenerate: async () => ({
      content: [{ type: 'text', text: JSON.stringify({ topic: 'in_scope', language: 'en', intent: 'draft' }) }],
      finishReason: stop,
      usage: USAGE,
      warnings: [],
    }),
    doStream: async ({ prompt }: { prompt: Prompt }) => {
      const step = plan(prompt);
      const parts: StreamPart[] = [{ type: 'stream-start', warnings: [] }];
      if (step.kind === 'tool') {
        parts.push({
          type: 'tool-call',
          toolCallId: `call-${step.toolName}`,
          toolName: step.toolName,
          input: JSON.stringify(step.input),
        });
        parts.push({ type: 'finish', finishReason: toolCalls, usage: USAGE });
      } else if (step.kind === 'bursts') {
        // AC-33: the reply arrives in bursts with pauses between them, as a real model's does.
        return {
          stream: new ReadableStream<never>({
            async start(controller) {
              controller.enqueue({ type: 'stream-start', warnings: [] } as never);
              controller.enqueue({ type: 'text-start', id: 't1' } as never);
              for (const [i, burst] of step.bursts.entries()) {
                if (i > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
                controller.enqueue({ type: 'text-delta', id: 't1', delta: burst } as never);
              }
              controller.enqueue({ type: 'text-end', id: 't1' } as never);
              controller.enqueue({ type: 'finish', finishReason: stop, usage: USAGE } as never);
              controller.close();
            },
          }),
        };
      } else {
        parts.push({ type: 'text-start', id: 't1' });
        for (const word of step.text.split(/(?<= )/)) {
          parts.push({ type: 'text-delta', id: 't1', delta: word });
        }
        parts.push({ type: 'text-end', id: 't1' });
        parts.push({ type: 'finish', finishReason: stop, usage: USAGE });
      }
      return {
        stream: new ReadableStream<never>({
          start(controller) {
            for (const p of parts) controller.enqueue(p as never);
            controller.close();
          },
        }),
      };
    },
  } as ConstructorParameters<typeof MockLanguageModelV4>[0]);
}
