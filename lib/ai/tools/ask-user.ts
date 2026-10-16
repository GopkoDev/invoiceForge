import 'server-only';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { DATA_NOT_INSTRUCTIONS } from '@/lib/mcp/server';
import { askUserInputSchema, checkAskUser, type AskUserInput } from '@/lib/services/assistant-drafts/forms';
import { withToolBudget } from '@/lib/ai/limits';
import type { TurnContext } from '@/lib/ai/turn-context';

const DESCRIPTION =
  'Ask the Freelancer everything still open in one Question form (up to 6 questions) instead of asking in prose. ' +
  'Offer records only by the ids the read tools returned; never write option labels, the app writes them. ' +
  'For a Customer, sender profile, bank account or product question you may omit recordIds; the app then offers the Freelancer\'s own records. ' +
  'Pass what the Freelancer already said as the partial draft. Your reply text must be at most two sentences leading into the form.';

/** T115/T120: Haiku sometimes sends a draft line with a blank description; the line keeps its place and is named "Line N". */
function nameBlankLines(raw: unknown): unknown {
  const draft = (raw as { draft?: { lines?: unknown } } | null)?.draft;
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.lines)) return raw;
  const lines = draft.lines.map((l, i) =>
    l && typeof l === 'object' && typeof (l as { description?: unknown }).description === 'string' && !(l as { description: string }).description.trim()
      ? { ...(l as Record<string, unknown>), description: `Line ${i + 1}` }
      : l
  );
  return { ...(raw as object), draft: { ...(draft as Record<string, unknown>), lines } };
}

const SPENT_PLACEHOLDER = { questions: [{ field: 'FREE', prompt: '-' }] };
const SAY = 'Write at most two sentences before the form; do not repeat the questions.';
const REFUSED_SAY = 'The options could not be offered. Ask again with other records from the read tools, or ask without options.';

/** ai-chat-v2 T54 (ADR-0011): the chat's only way to put questions in the form; code checks every id and writes every label. */
export function createAskUserTool(turn: TurnContext) {
  return createTool({
    id: 'ask_user',
    description: `${DESCRIPTION} ${DATA_NOT_INSTRUCTIONS}`,
    // Mastra validates the input before execute; once the turn's budget is spent the call is refused before any
    // check of its words (T103), so a spent budget lets any input through to that refusal.
    inputSchema: z.preprocess((raw) => (turn.toolBudget.callsLeft <= 0 ? SPENT_PLACEHOLDER : nameBlankLines(raw)), askUserInputSchema),
    execute: (raw: AskUserInput): Promise<Record<string, unknown>> =>
      withToolBudget(turn.toolBudget, async () => {
        const input = askUserInputSchema.parse(nameBlankLines(raw));
        const checked = await checkAskUser(turn.actor, input, { today: turn.today });
        if (checked.ok) {
          return {
            answer: { ok: true, shown: checked.questions.length, say: SAY },
            commit: () => {
              turn.pending.ask = { questions: checked.questions, draft: checked.draft };
            },
          };
        }
        return {
          answer: { ok: false, error: checked.error, say: REFUSED_SAY },
          commit: () => {
            turn.pending.askRefused = input.questions.map((q) => ({
              field: q.field,
              lineIndex: q.lineIndex ?? null,
              prompt: q.prompt,
              optional: q.optional ?? false,
            }));
          },
        };
      }),
  });
}
