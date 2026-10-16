import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';

// ADR-0004 guard rail 1: a span leaves the process carrying only metadata
// (names, timings, token counts, cost, outcome), never message text, a tool
// argument, a tool answer or a model output. Attributes are rebuilt from an
// allow-list, so a key a future Mastra version adds is dropped by default.

export const SPAN_ERROR_MESSAGE = 'redacted';

const SCALAR_KEYS = [
  'model',
  'provider',
  'finishReason',
  'stepIndex',
  'maxSteps',
  'success',
  'isContinued',
  'streaming',
  'resultType',
  'toolType',
  'toolCallId',
] as const;

const USAGE_KEYS = [
  'inputTokens',
  'outputTokens',
  'totalTokens',
  'reasoningTokens',
  'cachedInputTokens',
  'promptTokens',
  'completionTokens',
] as const;

const COST_KEYS = ['estimatedCost', 'costUnit', 'provider', 'model'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function pickPrimitives(source: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (!isRecord(source)) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (isPrimitive(source[key])) out[key] = source[key];
  }
  return out;
}

function toolNames(tools: unknown): string[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const names = tools
    .map((tool) => (typeof tool === 'string' ? tool : isRecord(tool) ? tool.name : undefined))
    .filter((name): name is string => typeof name === 'string');
  return names;
}

function allowedAttributes(attributes: unknown): Record<string, unknown> {
  if (!isRecord(attributes)) return {};
  const out = pickPrimitives(attributes, SCALAR_KEYS) ?? {};
  const usage = pickPrimitives(attributes.usage, USAGE_KEYS);
  if (usage) out.usage = usage;
  const cost = pickPrimitives(attributes.costContext, COST_KEYS);
  if (cost) out.costContext = cost;
  const tools = toolNames(attributes.availableTools);
  if (tools) out.availableTools = tools;
  return out;
}

export const metadataOnlyProcessor: SpanOutputProcessor = {
  name: 'metadata-only',
  process(span?: AnySpan): AnySpan | undefined {
    if (!span) return undefined;
    const target = span as unknown as Record<string, unknown>;
    const attributes = allowedAttributes(span.attributes);
    const errorInfo = span.errorInfo;

    target.input = undefined;
    target.output = undefined;
    target.attributes = attributes;
    target.metadata = undefined;
    target.requestContext = undefined;
    target.tags = undefined;
    if (errorInfo) {
      target.errorInfo = {
        id: errorInfo.id,
        domain: errorInfo.domain,
        category: errorInfo.category,
        message: SPAN_ERROR_MESSAGE,
      };
    }
    return span;
  },
  async shutdown() {},
};
