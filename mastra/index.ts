// Local Mastra Studio for debugging the chat agent: `pnpm studio` (http://localhost:4111).
// Never imported by the app. Unlike lib/ai/mastra.ts, traces here keep the full text (prompts, tool
// arguments and answers), so they go to a local file (.mastra/studio.db, gitignored), never to Neon.
//
// The agent's tools act as one Freelancer of the .env database. Pick them in Studio's request context:
//   { "userEmail": "you@example.com", "draftIntent": true }
// `draftIntent` stands in for the topic router (which runs before the agent in the app, ADR-0005):
// true lets propose_draft park a card, false makes it answer NOT_REQUESTED.
//
// Traces: by default Studio lists only its own runs (full text, the local file). The app's chats
// (localhost:3000) are traced metadata-only to the `mastra` schema of the .env database (ADR-0004), so they
// never show here. To see them, start Studio with STUDIO_TRACES=app (`STUDIO_TRACES=app pnpm studio`):
// Studio then lists the app's traces over a read-only connection, never creates or alters those tables, and
// keeps no traces of its own runs (they would carry full text into the shared database).
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { MastraCompositeStore } from '@mastra/core/storage';
import { LibSQLStore } from '@mastra/libsql';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import { PostgresStore } from '@mastra/pg';
import { createChatTools, MAX_STEPS } from '@/lib/ai/agent';
import { CHAT_INSTRUCTIONS } from '@/lib/ai/instructions/chat';
import { GATEWAY_PROVIDER_OPTIONS } from '@/lib/ai/gateway-options';
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
  defaultOptions: {
    maxSteps: MAX_STEPS,
    providerOptions: GATEWAY_PROVIDER_OPTIONS,
  },
});

// The dev server runs from mastra/public; INIT_CWD is the repo root `pnpm studio` was started from.
const studioFile = new LibSQLStore({
  id: 'studio-storage',
  url: `file:${process.env.INIT_CWD ?? process.cwd()}/.mastra/studio.db`,
});

/** The app's traces (STUDIO_TRACES=app): the `mastra` schema of the .env database, read only. */
function appTracesStorage() {
  const readOnly = new URL(process.env.DATABASE_URL ?? '');
  readOnly.searchParams.set('options', '-c default_transaction_read_only=on');
  const app = new PostgresStore({
    id: 'app-traces',
    connectionString: readOnly.toString(),
    // MASTRA_SCHEMA of lib/ai/mastra.ts, not imported: that module builds the app's own Mastra instance.
    schemaName: 'mastra',
    disableInit: true,
  });
  const traces = app.stores.observability;
  // The tables are the app's, made by `pnpm mastra:migrate`: Studio's start-up never creates or alters them.
  if (traces) traces.init = async () => {};
  return new MastraCompositeStore({
    id: 'studio-storage',
    default: studioFile,
    domains: { observability: traces },
  });
}

const appTraces = process.env.STUDIO_TRACES === 'app';

export const mastra = new Mastra({
  agents: { chatAgent },
  storage: appTraces ? appTracesStorage() : studioFile,
  ...(appTraces
    ? {}
    : {
        observability: new Observability({
          configs: {
            default: {
              serviceName: 'ai-assistant-studio',
              exporters: [new MastraStorageExporter()],
            },
          },
        }),
      }),
  bundler: { externals: ['server-only'] },
});
