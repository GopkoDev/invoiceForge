// Contract (ADR-0004 guard rail 1): every span passes the metadata-only processor before export,
// so no exported attribute carries message text, a tool argument, a tool answer or a model output.
// Rerun on every Mastra upgrade: an attribute key the processor has never heard of must be dropped.
//
// @mastra/observability (the tracing engine) is not a pinned dependency, so the scripted turn is
// the span set a Mastra turn emits (agent run -> model generation -> steps -> tool call), built to
// the real @mastra/core span shapes, and run through the processor the way the engine does:
// process(span) mutates and returns the same instance, or returns undefined to drop it.
import { describe, expect, it } from 'vitest';
import type { AnySpan } from '@mastra/core/observability';
import { metadataOnlyProcessor } from '@/lib/ai/observability/metadata-only-processor';

const MESSAGE = 'CANARY-7f3 invoice Acme for 1200 EUR';
const TOOL_ARG = 'CANARY-arg-9a1 Acme Corp';
const TOOL_ANSWER = 'CANARY-ans-4b2 IBAN DE00 1234';
const MODEL_OUTPUT = 'CANARY-out-5c8 Here is your draft for Acme';
const PROVIDER_ERROR = 'CANARY-err-2d6 provider rejected "invoice Acme"';
const UPGRADE_ATTR = 'CANARY-new-8e0 attribute from a future Mastra';
const CANARIES = [MESSAGE, TOOL_ARG, TOOL_ANSWER, MODEL_OUTPUT, PROVIDER_ERROR, UPGRADE_ATTR, 'CANARY'];

const T0 = new Date('2026-10-12T10:00:00.000Z');
const T1 = new Date('2026-10-12T10:00:02.500Z');

function span(partial: Record<string, unknown>): AnySpan {
  return {
    id: 's',
    traceId: 'trace-1',
    name: 'span',
    type: 'agent_run',
    startTime: T0,
    endTime: T1,
    isEvent: false,
    isInternal: false,
    isRootSpan: false,
    isValid: true,
    ...partial,
  } as unknown as AnySpan;
}

function scriptedTurn(): AnySpan[] {
  const usage = { inputTokens: 321, outputTokens: 45 };
  return [
    span({
      id: 'a1',
      name: "agent run: 'invoice-assistant'",
      type: 'agent_run',
      isRootSpan: true,
      entityName: 'invoice-assistant',
      input: [{ role: 'user', content: MESSAGE }],
      output: { text: MODEL_OUTPUT },
      attributes: { maxSteps: 8, instructions: MESSAGE, prompt: MESSAGE, availableTools: ['lookup_customer'], novelFutureKey: UPGRADE_ATTR },
      metadata: { userMessage: MESSAGE },
      requestContext: { lastMessage: MESSAGE },
      tags: [MESSAGE],
    }),
    span({
      id: 'g1',
      name: "llm: 'gemini'",
      type: 'model_generation',
      input: { messages: [{ role: 'user', content: MESSAGE }] },
      output: { text: MODEL_OUTPUT },
      attributes: {
        model: 'google/gemini-2.5-flash-lite',
        provider: 'gateway',
        usage,
        finishReason: 'stop',
        costContext: { estimatedCost: 0.0012, costMetadata: { echo: MESSAGE } },
        tools: [{ type: 'function', name: 'lookup_customer', description: MESSAGE, parameters: { q: TOOL_ARG } }],
        parameters: { maxOutputTokens: 1024, headers: { 'x-note': MESSAGE } },
      },
    }),
    span({
      id: 'st1',
      name: "step: 0",
      type: 'model_step',
      input: { messages: [{ role: 'user', content: MESSAGE }] },
      output: { text: MODEL_OUTPUT, toolCalls: [{ toolName: 'lookup_customer', args: { q: TOOL_ARG } }] },
      attributes: { stepIndex: 0, usage, finishReason: 'tool-calls', isContinued: true, warnings: { w: MESSAGE } },
    }),
    span({
      id: 'inf1',
      name: 'inference',
      type: 'model_inference',
      output: { text: MODEL_OUTPUT },
      attributes: { stepIndex: 0, usage, finishReason: 'tool-calls', providerOptions: { note: MESSAGE } },
    }),
    span({
      id: 'c1',
      name: "tool: 'lookup_customer'",
      type: 'tool_call',
      entityName: 'lookup_customer',
      input: { q: TOOL_ARG },
      output: { customer: TOOL_ANSWER },
      attributes: { success: true, toolDescription: TOOL_ANSWER, toolCallId: 'call-1' },
    }),
    span({
      id: 'e1',
      name: "llm: 'gemini'",
      type: 'model_generation',
      errorInfo: { message: PROVIDER_ERROR, id: 'PROVIDER_REJECTED', category: 'THIRD_PARTY', domain: 'gateway', stack: PROVIDER_ERROR, details: { raw: PROVIDER_ERROR } },
      attributes: { usage },
    }),
  ];
}

function exported(): AnySpan[] {
  return scriptedTurn()
    .map((s) => metadataOnlyProcessor.process(s))
    .filter((s): s is AnySpan => s !== undefined);
}

function serialise(s: AnySpan): string {
  return JSON.stringify(s, (_k, v) => (typeof v === 'function' ? undefined : v));
}

describe('metadata-only Mastra span processor', () => {
  it('is a named span output processor', () => {
    expect(typeof metadataOnlyProcessor.name).toBe('string');
    expect(metadataOnlyProcessor.name.length).toBeGreaterThan(0);
    expect(typeof metadataOnlyProcessor.process).toBe('function');
    expect(typeof metadataOnlyProcessor.shutdown).toBe('function');
  });

  it('returns the same span instance (the engine drops copies)', () => {
    const s = scriptedTurn()[0];
    expect(metadataOnlyProcessor.process(s)).toBe(s);
  });

  it('exports no span that carries message text, a tool argument, a tool answer or a model output', () => {
    const spans = exported();
    expect(spans.length).toBe(6);
    for (const s of spans) {
      const text = serialise(s);
      for (const canary of CANARIES) {
        expect(text, `span ${s.id} leaks ${canary}`).not.toContain(canary);
      }
    }
  });

  it('removes input and output from every span', () => {
    for (const s of exported()) {
      expect(s.input, `span ${s.id} input`).toBeUndefined();
      expect(s.output, `span ${s.id} output`).toBeUndefined();
    }
  });

  it('drops an attribute key it has never seen (allow-list)', () => {
    const root = exported()[0];
    expect(root.attributes as Record<string, unknown>).not.toHaveProperty('novelFutureKey');
  });

  it('keeps names, durations, step counts, tokens, cost and outcome', () => {
    const [root, generation, step, , tool] = exported();
    expect(root.name).toBe("agent run: 'invoice-assistant'");
    expect(root.startTime).toEqual(T0);
    expect(root.endTime).toEqual(T1);
    expect(root.id).toBe('a1');
    expect(root.traceId).toBe('trace-1');
    expect((root.attributes as { maxSteps?: number }).maxSteps).toBe(8);

    const gen = generation.attributes as {
      usage?: { inputTokens?: number; outputTokens?: number };
      finishReason?: string;
      costContext?: { estimatedCost?: number };
      model?: string;
    };
    expect(gen.usage).toEqual({ inputTokens: 321, outputTokens: 45 });
    expect(gen.finishReason).toBe('stop');
    expect(gen.costContext?.estimatedCost).toBe(0.0012);
    expect(gen.model).toBe('google/gemini-2.5-flash-lite');

    expect((step.attributes as { stepIndex?: number }).stepIndex).toBe(0);
    expect((step.attributes as { finishReason?: string }).finishReason).toBe('tool-calls');

    expect(tool.name).toBe("tool: 'lookup_customer'");
    expect(tool.entityName).toBe('lookup_customer');
    expect((tool.attributes as { success?: boolean }).success).toBe(true);
  });

  it('keeps the error class and code of an error span but drops the provider message', () => {
    const err = exported()[5];
    expect(err.errorInfo).toBeDefined();
    expect(err.errorInfo?.id).toBe('PROVIDER_REJECTED');
    expect(err.errorInfo?.category).toBe('THIRD_PARTY');
    expect(err.errorInfo?.message ?? '').not.toContain('CANARY');
    expect(err.errorInfo?.stack ?? '').not.toContain('CANARY');
    expect(JSON.stringify(err.errorInfo?.details ?? {})).not.toContain('CANARY');
  });
});
