import 'server-only';
import { createTool } from '@mastra/core/tools';
import { READ_QUESTIONS } from '@/lib/assistant-tools';
import { DATA_NOT_INSTRUCTIONS } from '@/lib/mcp/server';
import { toToolError } from '@/lib/mcp/answers';
import type { AppLink } from '@/lib/validations/assistant-chat';
import type { TurnContext } from '@/lib/ai/turn-context';

const CHAT_KEY_ID = 'chat';

/** One invoice link per invoice named in the answer (its rows, or the answer itself), in order. */
function invoiceLinks(answer: Record<string, unknown>): AppLink[] {
  const seen = new Set<string>();
  const links: AppLink[] = [];
  const add = (item: unknown) => {
    if (!item || typeof item !== 'object') return;
    const { invoiceId, invoiceNumber } = item as { invoiceId?: unknown; invoiceNumber?: unknown };
    if (typeof invoiceId !== 'string' || !invoiceId || seen.has(invoiceId)) return;
    seen.add(invoiceId);
    links.push({ kind: 'invoice', invoiceId, label: typeof invoiceNumber === 'string' ? invoiceNumber : invoiceId });
  };
  add(answer);
  if (Array.isArray(answer.rows)) answer.rows.forEach(add);
  return links;
}

/**
 * The seven shared read questions as chat tools bound to this turn's Freelancer (ADR-0010). The
 * handlers are the MCP ones; the answer is theirs unchanged plus the invoice links.
 */
export function createReadTools(turn: TurnContext) {
  const context = { actor: turn.actor, keyId: CHAT_KEY_ID, origin: turn.origin };
  return Object.fromEntries(
    READ_QUESTIONS.map(({ definition, handler }) => [
      definition.name,
      createTool({
        id: definition.name,
        description: `${definition.description} ${DATA_NOT_INSTRUCTIONS}`,
        inputSchema: definition.inputSchema,
        execute: async (rawArgs: unknown): Promise<Record<string, unknown>> => {
          // Parsing strips any key the schema does not name, so a model-supplied id is ignored.
          const args = definition.inputSchema.parse(rawArgs ?? {});
          const outcome = await handler(args, context);
          if (!outcome.success) return { ...toToolError(outcome) };
          const answer = outcome.data as Record<string, unknown>;
          return { ...answer, links: invoiceLinks(answer) };
        },
      }),
    ])
  );
}
