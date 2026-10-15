import 'server-only';
import { createTool } from '@mastra/core/tools';
import { READ_QUESTIONS } from '@/lib/assistant-tools';
import { DATA_NOT_INSTRUCTIONS } from '@/lib/mcp/server';
import { toToolError } from '@/lib/mcp/answers';
import {
  LINK_LABEL_MAX_CHARS,
  TOOL_ANSWER_MAX_BYTES,
  TOOL_ARRAY_MAX_ITEMS,
  TOOL_STRING_MAX_CHARS,
  jsonBytes,
  sliceSafe,
  withToolBudget,
} from '@/lib/ai/limits';
import type { AppLink } from '@/lib/validations/assistant-chat';
import type { TurnContext } from '@/lib/ai/turn-context';
import { isOwnSenderProfileName } from '@/lib/services/sender-profiles/sender-profiles';

const CHAT_KEY_ID = 'chat';

const TRUNCATION_MARKER = '… [truncated]';

function capValue(value: unknown, stringMax: number, arrayMax: number): unknown {
  if (typeof value === 'string') {
    return value.length > stringMax ? sliceSafe(value, stringMax) + TRUNCATION_MARKER : value.toWellFormed();
  }
  if (Array.isArray(value)) return value.slice(0, arrayMax).map((v) => capValue(v, stringMax, arrayMax));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k.toWellFormed()] = capValue(v, stringMax, arrayMax);
      if (Array.isArray(v) && v.length > arrayMax) out.truncated = true;
    }
    return out;
  }
  return value;
}

/**
 * The answer as the model sees it: strings, arrays and the serialized size are bounded (T99, SEC-M-01; T103: in
 * UTF-8 bytes, with a final check that always holds). Returns a copy; the shared handler output (and so the MCP
 * answer) is never changed.
 */
export function capToolAnswer(answer: Record<string, unknown>): Record<string, unknown> {
  let stringMax = TOOL_STRING_MAX_CHARS;
  let out = capValue(answer, stringMax, TOOL_ARRAY_MAX_ITEMS) as Record<string, unknown>;
  if (jsonBytes(out) <= TOOL_ANSWER_MAX_BYTES) return out;
  for (const arrayMax of [TOOL_ARRAY_MAX_ITEMS, 10, 3]) {
    for (stringMax = TOOL_STRING_MAX_CHARS / 2; stringMax >= 20; stringMax = Math.floor(stringMax / 2)) {
      out = { ...(capValue(answer, stringMax, arrayMax) as Record<string, unknown>), truncated: true };
      if (jsonBytes(out) <= TOOL_ANSWER_MAX_BYTES) return out;
    }
  }
  // Still too big: keep whole top-level keys of the smallest form while they fit.
  const kept: Record<string, unknown> = { truncated: true };
  for (const [k, v] of Object.entries(out)) {
    if (k === 'truncated') continue;
    kept[k] = v;
    if (jsonBytes(kept) > TOOL_ANSWER_MAX_BYTES) delete kept[k];
  }
  if (jsonBytes(kept) <= TOOL_ANSWER_MAX_BYTES) return kept;
  return { truncated: true, note: 'The answer was too large to show.' };
}

/** One invoice link per invoice named in the answer (its rows, or the answer itself), in order. */
function invoiceLinks(answer: Record<string, unknown>): AppLink[] {
  const seen = new Set<string>();
  const links: AppLink[] = [];
  const add = (item: unknown) => {
    if (!item || typeof item !== 'object') return;
    const { invoiceId, invoiceNumber } = item as { invoiceId?: unknown; invoiceNumber?: unknown };
    if (typeof invoiceId !== 'string' || !invoiceId || seen.has(invoiceId)) return;
    seen.add(invoiceId);
    links.push({ kind: 'invoice', invoiceId, label: sliceSafe(typeof invoiceNumber === 'string' ? invoiceNumber : invoiceId, LINK_LABEL_MAX_CHARS) });
  };
  add(answer);
  if (Array.isArray(answer.rows)) answer.rows.forEach(add);
  return links;
}

/** The page to add the record a named read found nothing for (AC-05, SCR-03 "answered — nothing matches"). */
const ADD_PAGE_WHEN_NONE: Partial<Record<string, AppLink>> = {
  list_customers: { kind: 'page', page: 'new-customer' },
  list_products: { kind: 'page', page: 'new-product' },
};

/**
 * The add page when a read filtered by a name matched nothing; the link comes from code, not from the model. A
 * Customer name that is the Freelancer's own sender profile gets none (AC-05b, D-1; review 2026-10-13 R3-B1).
 */
async function addPageLinks(
  turn: TurnContext,
  tool: string,
  args: Record<string, unknown>,
  answer: Record<string, unknown>
): Promise<AppLink[]> {
  const link = ADD_PAGE_WHEN_NONE[tool];
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  const total = (answer.pageInfo as { total?: unknown } | undefined)?.total;
  if (!link || !name || total !== 0) return [];
  if (tool === 'list_customers' && (await isOwnSenderProfileName(turn.actor, name))) return [];
  return [link];
}

/**
 * The shared read questions (READ_QUESTIONS) as chat tools bound to this turn's Freelancer (ADR-0010). The
 * handlers are the MCP ones; the answer is theirs unchanged plus the invoice links
 * and, for a named Customer or product read that matched nothing, the page to add one.
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
        execute: (rawArgs: unknown): Promise<Record<string, unknown>> =>
          withToolBudget(turn.toolBudget, async () => {
            // Parsing strips any key the schema does not name, so a model-supplied id is ignored.
            const args = definition.inputSchema.parse(rawArgs ?? {});
            const outcome = await handler(args, context);
            if (!outcome.success) return { ...toToolError(outcome) };
            const answer = outcome.data as Record<string, unknown>;
            return { ...capToolAnswer(answer), links: [...invoiceLinks(answer), ...(await addPageLinks(turn, definition.name, args, answer))] };
          }),
      }),
    ])
  );
}
