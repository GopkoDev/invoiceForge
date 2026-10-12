// Local Mastra Studio for debugging the chat agent: `pnpm studio` (http://localhost:4111).
// Never imported by the app. Unlike lib/ai/mastra.ts, traces here keep the full text (prompts, tool
// arguments and answers), so they go to a local file (.mastra/studio.db, gitignored), never to Neon.
//
// The agent's tools act as one Freelancer of the .env database. Pick them in Studio's request context:
//   { "userEmail": "you@example.com", "draftIntent": true }
// `draftIntent` stands in for the topic router (which runs before the agent in the app, ADR-0005):
// true lets propose_draft park a card, false makes it answer NOT_REQUESTED.
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import { createChatTools, MAX_STEPS } from '@/lib/ai/agent';
import { CHAT_INSTRUCTIONS } from '@/lib/ai/instructions/chat';
import { getChatModel } from '@/lib/ai/model';
import { createTurnContext } from '@/lib/ai/turn-context';
import { todayInZone } from '@/lib/helpers/calendar-day';
import { createActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { prisma } from '@/prisma';

async function studioTurn(requestContext: { get: (key: string) => unknown }) {
  const email =
    (requestContext.get('userEmail') as string | undefined) ??
    process.env.STUDIO_USER_EMAIL;
  if (!email)
    throw new Error(
      'Set "userEmail" in the request context (or STUDIO_USER_EMAIL in .env).'
    );
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, timeZone: true },
  });
  if (!user)
    throw new Error(`No user with email ${email} in the .env database.`);
  const actor = await createActingFreelancer(
    user.id,
    user.timeZone ?? undefined
  );
  return createTurnContext({
    actor,
    today: todayInZone(actor.timeZone),
    draftIntent: requestContext.get('draftIntent') !== false,
  });
}

export const chatAgent = new Agent({
  id: 'chat-agent-studio',
  name: 'Chat Assistant (studio)',
  instructions: CHAT_INSTRUCTIONS,
  model: () => getChatModel(),
  tools: async ({ requestContext }) =>
    createChatTools(await studioTurn(requestContext)),
  defaultOptions: { maxSteps: MAX_STEPS },
});

export const mastra = new Mastra({
  agents: { chatAgent },
  // The dev server runs from mastra/public; INIT_CWD is the repo root `pnpm studio` was started from.
  storage: new LibSQLStore({
    id: 'studio-storage',
    url: `file:${process.env.INIT_CWD ?? process.cwd()}/.mastra/studio.db`,
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'ai-assistant-studio',
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
  bundler: { externals: ['server-only'] },
});
