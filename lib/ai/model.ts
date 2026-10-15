import { gateway } from '@ai-sdk/gateway';

// ai-chat-v2 ADR-0014 (supersedes ai-assistant ADR-0003): Claude Haiku 5.5 through the Vercel AI Gateway. The id is a setting, not a constant.
export const DEFAULT_CHAT_MODEL = 'anthropic/claude-haiku-5.5';

// T35: the scripted stub is selected only by the e2e harness, which sets both values; read at call time.
// Loaded lazily so `ai/test` is never loaded unless this branch runs.
export async function getChatModel() {
  if (process.env.E2E === '1' && process.env.AI_CHAT_MODEL === 'stub:e2e') {
    const { createE2eStubModel } = await import('./e2e-stub-model');
    return createE2eStubModel();
  }
  return gateway(process.env.AI_CHAT_MODEL || DEFAULT_CHAT_MODEL);
}
