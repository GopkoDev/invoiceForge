import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getChatModel } from '@/lib/ai/model';
import { gatewayCostOf } from '@/lib/ai/gateway-cost';
import { withProviderFaults } from '@/lib/ai/provider-fault';
import { MIXED_INSTRUCTION, OFF_TOPIC_REFUSAL, type RouterLanguage } from '@/lib/ai/instructions/refusal';

export type RouterTopic = 'IN_SCOPE' | 'MIXED' | 'OFF_TOPIC';

export interface RouterTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface RouterVerdict {
  topic: RouterTopic;
  language: string;
  refusal?: string;
  instruction?: string;
  /** The gateway-reported USD cost of the classification call (0 when none is reported). */
  costUsd?: number;
}

const verdictSchema = z.object({
  topic: z.enum(['in_scope', 'mixed', 'off_topic']),
  language: z.string(),
});

const SYSTEM = `Classify the latest user message of an Invoice Forge assistant chat.
in_scope: about the user's own data in Invoice Forge, drafting invoices, or finding things in the app.
off_topic: nothing in the message is in scope (tax or legal advice, general knowledge, chit-chat, etc.).
mixed: part of the message is in scope and part is not.
Use the recent turns to resolve short follow-ups. Also return the ISO 639-1 language code of the latest message (for example "en" or "uk").`;

export async function classifyMessage({
  message,
  recentTurns,
}: {
  message: string;
  recentTurns: RouterTurn[];
}): Promise<RouterVerdict> {
  const { output, providerMetadata } = await generateText({
    model: withProviderFaults(await getChatModel()),
    system: SYSTEM,
    messages: [...recentTurns, { role: 'user' as const, content: message }],
    output: Output.object({ schema: verdictSchema }),
  });

  const language = output.language;
  const costUsd = gatewayCostOf(providerMetadata);
  if (output.topic === 'off_topic') {
    const refusal = OFF_TOPIC_REFUSAL[language as RouterLanguage] ?? OFF_TOPIC_REFUSAL.en;
    return { topic: 'OFF_TOPIC', language, refusal, costUsd };
  }
  if (output.topic === 'mixed') return { topic: 'MIXED', language, instruction: MIXED_INSTRUCTION, costUsd };
  return { topic: 'IN_SCOPE', language, costUsd };
}
