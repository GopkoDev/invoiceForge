import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { findInApp } from '@/lib/ai/app-map';

/** "Where is this in the app": answers only from the fixed app map, never from the model (AC-07). */
export function createFindInAppTool() {
  return createTool({
    id: 'find_in_app',
    description:
      'Finds the pages of Invoice Forge where something is set or shown, for example the logo or bank accounts. ' +
      'Returns page keys with a title and what is set there; the app links to them.',
    inputSchema: z.object({ topic: z.string().min(1).max(200).describe('What the Freelancer is looking for.') }),
    execute: async ({ topic }) => ({ pages: findInApp(topic) }),
  });
}
