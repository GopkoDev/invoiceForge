// ai-chat-v2 ADR-0014 / review round 2 N1: pin to Anthropic so the privacy page's processor list stays true; no cross-provider fallback. A non-Anthropic gateway model id is refused by the pin. Non-gateway models ignore the key.
// SEC-L-03: the no-training promise is requested on every call (disallowPromptTraining); the Gateway fails closed if no provider matches.
// Kept apart from model.ts so tests that mock '@/lib/ai/model' still get it.
export const GATEWAY_PROVIDER_OPTIONS = { gateway: { only: ['anthropic'], disallowPromptTraining: true } };
