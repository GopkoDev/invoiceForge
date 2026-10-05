import * as Sentry from '@sentry/nextjs';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isJsonContentType } from '@modelcontextprotocol/sdk/shared/mediaType.js';
import { runMcpPipeline } from '@/lib/mcp/authenticate';
import { createMcpServer } from '@/lib/mcp/server';

// The Assistant connection (ADR-0002/0003): stateless Streamable HTTP, JSON responses, Bearer key
// only. No CORS headers are sent and no OPTIONS handler exists; cookies are never read.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One small JSON-RPC message per request (openapi.yaml): the cap is far above any tool call.
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    const pipeline = await runMcpPipeline(request);
    if (!pipeline.ok) return pipeline.response;

    // The transport's own header checks, run here first so a bad Accept or Content-Type
    // answers 406/415 before the body is read, whatever the body holds.
    const unacceptable = checkHeaders(request);
    if (unacceptable) return unacceptable;

    // The key limit has already counted this POST; a refused batch or oversized body still
    // counts (AC-11) but never reaches the transport, so no tool runs.
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;

    const server = createMcpServer({
      actor: pipeline.actor,
      keyId: pipeline.keyId,
      origin: requestOrigin(request),
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      // Only a backstop: the route has already read and parsed the body within the cap.
      maxRequestBodySize: MAX_BODY_BYTES,
    });
    // The SDK's own failures are reported here; their text never reaches the client.
    transport.onerror = (error) => Sentry.captureException(error);
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody: body.value });
    return await withoutErrorData(response);
  } catch (error) {
    Sentry.captureException(error);
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Something went wrong in invoiceFlow. Try again.',
        },
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}

/** Drops error.data (the SDK puts the raw error text there) from a JSON-RPC error response. */
async function withoutErrorData(response: Response): Promise<Response> {
  if (response.status < 400) return response;
  if (!response.headers.get('content-type')?.includes('application/json')) return response;
  try {
    const payload = (await response.clone().json()) as { error?: { data?: unknown } };
    if (!payload.error || !('data' in payload.error)) return response;
    delete payload.error.data;
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(JSON.stringify(payload), { status: response.status, headers });
  } catch {
    return response;
  }
}

function jsonRpcRefusal(status: number, code: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', id: null, error: { code, message } }),
    { status, headers: { 'content-type': 'application/json' } }
  );
}

/** The SDK transport's Accept and Content-Type checks, with the same bodies. */
function checkHeaders(request: Request): Response | null {
  const accept = request.headers.get('accept');
  if (!accept?.includes('application/json') || !accept.includes('text/event-stream')) {
    return jsonRpcRefusal(
      406,
      -32000,
      'Not Acceptable: Client must accept both application/json and text/event-stream'
    );
  }
  if (!isJsonContentType(request.headers.get('content-type'))) {
    return jsonRpcRefusal(
      415,
      -32000,
      'Unsupported Media Type: Content-Type must be application/json'
    );
  }
  return null;
}

/** Reads at most MAX_BODY_BYTES and refuses an oversized body, bad JSON or a batch array. */
async function readJsonBody(
  request: Request
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const tooLarge = {
    ok: false as const,
    response: jsonRpcRefusal(413, -32600, 'The request body is too large.'),
  };
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return tooLarge;

  let text = '';
  if (request.body) {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        // The client went away mid-body: a client error, not ours, so nothing is reported.
        return {
          ok: false,
          response: jsonRpcRefusal(400, -32700, 'Parse error: the request body could not be read'),
        };
      }
      const { done, value } = chunk;
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        await reader.cancel();
        return tooLarge;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // Not reported: a client error, and the SyntaxError message quotes the body (maybe a key).
    return {
      ok: false,
      response: jsonRpcRefusal(400, -32700, 'Parse error: Invalid JSON'),
    };
  }
  if (Array.isArray(value)) {
    return {
      ok: false,
      response: jsonRpcRefusal(400, -32600, 'Invalid Request: batches are not accepted'),
    };
  }
  return { ok: true, value };
}

/** Public origin, as the Connect-your-AI page derives it: forwarded host first, else the request. */
function requestOrigin(request: Request): string {
  const host = request.headers.get('x-forwarded-host');
  if (!host) return new URL(request.url).origin;
  const proto = request.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function methodNotAllowed(): Response {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Method not allowed.' } }),
    { status: 405, headers: { allow: 'POST', 'content-type': 'application/json' } }
  );
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
