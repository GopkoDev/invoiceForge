import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { runMcpPipeline } from '@/lib/mcp/authenticate';
import { createMcpServer } from '@/lib/mcp/server';

// The Assistant connection (ADR-0002/0003): stateless Streamable HTTP, JSON responses, Bearer key
// only. No CORS headers are sent and no OPTIONS handler exists; cookies are never read.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const pipeline = await runMcpPipeline(request);
    if (!pipeline.ok) return pipeline.response;

    const server = createMcpServer({
      actor: pipeline.actor,
      keyId: pipeline.keyId,
      origin: requestOrigin(request),
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'invoiceFlow could not complete this call. Try again later.',
          data: { code: 'FAILED' },
        },
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}

/** Public origin, as the Connect-your-AI page derives it: forwarded host first, else the request. */
function requestOrigin(request: Request): string {
  const host = request.headers.get('x-forwarded-host');
  if (!host) return new URL(request.url).origin;
  const proto = request.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { allow: 'POST' } });
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
