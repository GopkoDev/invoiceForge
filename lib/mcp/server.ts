import 'server-only';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';

export interface McpCallContext {
  actor: ActingFreelancer;
  keyId: string;
}

/**
 * A fresh, stateless server per POST (ADR-0002). No tools are registered yet (T13 adds the
 * registry); the context is what every tool will receive, never anything from the request body.
 */
export function createMcpServer(context: McpCallContext): McpServer {
  void context; // handed to tools once T13 registers them
  const server = new McpServer({ name: 'invoiceflow', version: '1.0.0' });
  // Registering and removing a placeholder turns the tools capability on, so tools/list
  // answers an empty list instead of "method not found" until the registry exists.
  server
    .registerTool('placeholder', { description: 'placeholder' }, () => ({
      content: [],
    }))
    .remove();
  return server;
}
