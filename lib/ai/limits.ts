/** Per-minute refusal (ai-chat-v2 T100, SEC-M-01 c): AssistantTurn rows of any outcome inside the window. */
export const CHAT_PER_MINUTE_MAX = 10;
export const CHAT_RATE_WINDOW_MS = 60_000;

/** Bounds on what one model call may send or produce (ai-chat-v2 T99, SEC-M-01; sizes in UTF-8 bytes since T103). */
export const ROUTER_MAX_OUTPUT_TOKENS = 300;
export const AGENT_MAX_OUTPUT_TOKENS = 2000;
/** Total UTF-8 bytes of conversation history sent to the model, after the message-count cap. */
export const HISTORY_BYTES_BUDGET = 40_000;
export const TOOL_STRING_MAX_CHARS = 2000;
export const TOOL_ARRAY_MAX_ITEMS = 50;
/** One tool answer, as UTF-8 bytes of its JSON. */
export const TOOL_ANSWER_MAX_BYTES = 20_000;
/** All tool answers of one turn together, and the number of tool calls in one turn (T103, SEC-M-02). */
export const TURN_TOOL_BUDGET_BYTES = 60_000;
export const TURN_TOOL_CALLS_MAX = 12;
export const LINK_LABEL_MAX_CHARS = 80;
export const TOOL_BUDGET_USED_UP_TEXT = 'The tool budget for this message is used up; answer from what you already have.';

export const jsonBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');

/** The first `max` UTF-16 units of `text`, one fewer when the cut would split a surrogate pair. */
export function sliceSafe(text: string, max: number): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

export type ToolBudget = { bytesLeft: number; callsLeft: number };
type UsedUp = { message: typeof TOOL_BUDGET_USED_UP_TEXT };
const USED_UP: UsedUp = { message: TOOL_BUDGET_USED_UP_TEXT };

/** Takes one call from the budget, synchronously (parallel tool calls); false when none is left. */
export function reserveToolCall(budget: ToolBudget): boolean {
  if (budget.callsLeft <= 0) return false;
  budget.callsLeft -= 1;
  return true;
}

/** Charges the answer's bytes; an answer that does not fit is replaced by the fixed text and not charged. */
export function chargeToolBytes<T extends Record<string, unknown>>(budget: ToolBudget, answer: T): T | UsedUp {
  const bytes = jsonBytes(answer);
  if (bytes > budget.bytesLeft) return USED_UP;
  budget.bytesLeft -= bytes;
  return answer;
}

export function spendToolBudget<T extends Record<string, unknown>>(budget: ToolBudget, answer: T): T | UsedUp {
  return reserveToolCall(budget) ? chargeToolBytes(budget, answer) : USED_UP;
}

/** Runs a tool body under the turn's budget: no call left, no run; the produced answer must fit the bytes left. */
export async function withToolBudget(
  budget: ToolBudget,
  run: () => Promise<Record<string, unknown>>
): Promise<Record<string, unknown>> {
  if (!reserveToolCall(budget)) return USED_UP;
  return chargeToolBytes(budget, await run());
}

/** Keeps the newest items whose content totals at most the budget (UTF-8 bytes); drops oldest whole items, always keeps the newest. */
export function trimHistoryToBudget<T extends { content: string }>(history: T[], budget = HISTORY_BYTES_BUDGET): T[] {
  let total = 0;
  let start = history.length;
  for (let i = history.length - 1; i >= 0; i--) {
    total += Buffer.byteLength(history[i].content, 'utf8');
    if (total > budget && start !== history.length) break;
    start = i;
  }
  return history.slice(start);
}
