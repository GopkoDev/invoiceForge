import { gateway } from '@ai-sdk/gateway';

// ADR-0003: a Gemini Flash-Lite model through the Vercel AI Gateway. The id is a setting, not a constant.
export const DEFAULT_CHAT_MODEL = 'google/gemini-2.5-flash-lite';

export function getChatModel() {
  return gateway(process.env.AI_CHAT_MODEL || DEFAULT_CHAT_MODEL);
}
