import { Agent } from '@mastra/core/agent';
import { CHAT_INSTRUCTIONS } from '@/lib/ai/instructions/chat';
import { GATEWAY_PROVIDER_OPTIONS } from '@/lib/ai/gateway-options';
import { getChatModel } from '@/lib/ai/model';
import { withProviderFaults } from '@/lib/ai/provider-fault';
import { createAskUserTool } from '@/lib/ai/tools/ask-user';
import { createFindInAppTool } from '@/lib/ai/tools/find-in-app';
import { createProposeDraftTool } from '@/lib/ai/tools/propose-draft';
import { createReadTools } from '@/lib/ai/tools/read-tools';
import type { TurnContext } from '@/lib/ai/turn-context';

/** The per-message work cap (spec §6): at most 8 agent steps. */
export const MAX_STEPS = 8;

/** Request-context key under which the route-bound turn travels to the agent's tools. */
export const TURN_CONTEXT_KEY = 'turn';

/**
 * The tools of one turn in a fixed order (the read questions, find_in_app, propose_draft) so the
 * prompt prefix is stable. No tool here can issue, send, edit or delete (AC-24).
 */
export function createChatTools(turn: TurnContext) {
  return {
    ...createReadTools(turn),
    find_in_app: createFindInAppTool(turn),
    propose_draft: createProposeDraftTool(turn),
    ask_user: createAskUserTool(turn),
  };
}

// The model is resolved per call so the AI_CHAT_MODEL setting is read at run time, and wrapped so its faults
// are told apart from ours (R-05). The tools close over the acting Freelancer, so they are built per turn from
// the request context. These instructions are the only copy the model gets (run-turn adds none, R-19).
export const chatAgent = new Agent({
  id: 'chat-agent',
  name: 'Chat Assistant',
  instructions: CHAT_INSTRUCTIONS,
  model: async () => withProviderFaults(await getChatModel()),
  defaultOptions: { providerOptions: GATEWAY_PROVIDER_OPTIONS },
  tools: ({ requestContext }) => createChatTools(requestContext.get(TURN_CONTEXT_KEY) as TurnContext),
});
