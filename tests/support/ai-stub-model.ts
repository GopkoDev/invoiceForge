// T34 (ai-assistant): a scripted stand-in for the chat model, used by the /api/chat integration tests.
// It is an AI SDK MockLanguageModelV4, injected through vi.mock('@/lib/ai/model'); the real model and the
// network are never used. Each streamed step is one of: text, tool calls, a thrown provider error, an error
// part after some text, or a hang that never answers (honouring the abort signal).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { MockLanguageModelV4 } from 'ai/test';

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};

export type ToolCallStep = { name: string; input: Record<string, unknown> };

export type StubStep =
  | { text?: string; toolCall?: ToolCallStep; toolCalls?: ToolCallStep[] }
  /** The provider call itself throws (429, 5xx, timeout, network). */
  | { error: Error }
  /** Some text streams, then the stream carries an error part. */
  | { text?: string; streamError: Error }
  /** The provider accepts the call and never answers. */
  | { hang: true }
  /** Some text streams, then the stream goes silent without finishing. */
  | { text: string; stall: true };

export interface StubOptions {
  /** The topic router's verdict, or an error it throws. */
  verdict?: { topic: string; language: string; intent?: string } | Error;
  /** Step `i` of the agent (0-based); `prompt` is the prompt the model is called with, tool results included. */
  steps: (i: number, prompt: unknown) => StubStep;
}

const never = (signal?: AbortSignal) =>
  new Promise<never>((_, reject) => {
    signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });

export function scriptedModel(opts: StubOptions) {
  let streamCall = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      if (opts.verdict instanceof Error) throw opts.verdict;
      return {
        content: [{ type: 'text', text: JSON.stringify(opts.verdict ?? { topic: 'in_scope', language: 'en', intent: 'read' }) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      } as any;
    },
    doStream: async (options: any) => {
      const call = streamCall++;
      const step = opts.steps(call, options?.prompt);
      if ('error' in step) throw step.error;
      if ('hang' in step) await never(options?.abortSignal);

      const id = `t${call}`;
      const chunks: any[] = [{ type: 'stream-start', warnings: [] }];
      const text = 'text' in step ? step.text : undefined;
      if (text) {
        chunks.push({ type: 'text-start', id });
        chunks.push({ type: 'text-delta', id, delta: text });
        if (!('stall' in step) && !('streamError' in step)) chunks.push({ type: 'text-end', id });
      }
      if ('streamError' in step) chunks.push({ type: 'error', error: step.streamError });
      const calls = 'toolCalls' in step && step.toolCalls ? step.toolCalls : 'toolCall' in step && step.toolCall ? [step.toolCall] : [];
      calls.forEach((c, n) =>
        chunks.push({ type: 'tool-call', toolCallId: `call-${call}-${n}`, toolName: c.name, input: JSON.stringify(c.input) })
      );
      const stalls = 'stall' in step;
      if (!stalls && !('streamError' in step)) {
        chunks.push({ type: 'finish', finishReason: { unified: calls.length ? 'tool-calls' : 'stop', raw: 'x' }, usage });
      }
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const c of chunks) controller.enqueue(c);
            if (!stalls) controller.close();
          },
        }),
      } as any;
    },
  });
}

/** The `data: <json>` events of a UI-message stream, in order. */
export async function readParts(response: Response): Promise<any[]> {
  const text = await response.text();
  return partsOfText(text);
}

export function partsOfText(text: string): any[] {
  return text
    .split('\n')
    .filter((l) => l.startsWith('data: ') && l.trim() !== 'data: [DONE]')
    .map((l) => JSON.parse(l.slice('data: '.length)));
}
