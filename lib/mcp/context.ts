import type { McpCallContext } from '@/lib/assistant-tools';

/** What the MCP endpoint knows about the calling key; the chat has no key (ADR-0011). */
export type McpServerContext = McpCallContext & {
  key: { id: string; name: string; canCreateDrafts: boolean };
};
