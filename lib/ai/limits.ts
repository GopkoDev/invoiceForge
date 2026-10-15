/** Per-minute refusal (ai-chat-v2 T100, SEC-M-01 c): AssistantTurn rows of any outcome inside the window. */
export const CHAT_PER_MINUTE_MAX = 10;
export const CHAT_RATE_WINDOW_MS = 60_000;

/** Bounds on what one model call may send or produce (ai-chat-v2 T99, SEC-M-01). */
export const ROUTER_MAX_OUTPUT_TOKENS = 300;
export const AGENT_MAX_OUTPUT_TOKENS = 2000;
/** Total characters of conversation history sent to the model, after the message-count cap. */
export const HISTORY_CHAR_BUDGET = 40_000;
export const TOOL_STRING_MAX_CHARS = 2000;
export const TOOL_ARRAY_MAX_ITEMS = 50;
export const TOOL_ANSWER_MAX_CHARS = 20_000;

/** Keeps the newest items whose content totals at most the budget; drops oldest whole items, always keeps the newest. */
export function trimHistoryToBudget<T extends { content: string }>(history: T[], budget = HISTORY_CHAR_BUDGET): T[] {
  let total = 0;
  let start = history.length;
  for (let i = history.length - 1; i >= 0; i--) {
    total += history[i].content.length;
    if (total > budget && start !== history.length) break;
    start = i;
  }
  return history.slice(start);
}
