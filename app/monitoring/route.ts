// Sentry tunnel (AC-22): forwards browser envelopes only for the DSN configured for this
// environment; anything else is refused. Nothing is logged or persisted.

// Sentry envelopes are small; the SDK itself drops anything near this size.
const MAX_BODY_BYTES = 1_048_576;

// The backoff hints the SDK needs to slow down; nothing else from upstream is passed on.
const RATE_LIMIT_HEADERS = ['retry-after', 'x-sentry-rate-limits'] as const;

function refuse(status: number): Response {
  return new Response(null, { status });
}

function parseDsn(value: unknown): { host: string; projectId: string } | null {
  if (typeof value !== 'string' || value === '') return null;
  try {
    const url = new URL(value);
    const projectId = url.pathname.split('/').filter(Boolean).pop();
    if (!projectId) return null;
    return { host: url.host, projectId };
  } catch {
    return null;
  }
}

// Reads at most MAX_BODY_BYTES; null as soon as the body turns out to be larger.
async function readCapped(
  request: Request
): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

function withRateLimitHeaders(status: number, upstream: Response): Response {
  const headers = new Headers();
  for (const name of RATE_LIMIT_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Response(null, { status, headers });
}

// Only the header line is decoded; the envelope itself (which may carry compressed binary
// items such as replay recordings) is forwarded byte for byte.
function headerLine(bytes: Uint8Array): string {
  const end = bytes.indexOf(0x0a);
  return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end));
}

export async function POST(request: Request): Promise<Response> {
  const configured = parseDsn(process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (!configured) return refuse(403);

  const body = await readCapped(request);
  if (!body) return refuse(413);
  let requested: ReturnType<typeof parseDsn> = null;
  try {
    const header: unknown = JSON.parse(headerLine(body));
    requested = parseDsn((header as { dsn?: unknown } | null)?.dsn);
  } catch {
    return refuse(403);
  }
  if (
    !requested ||
    requested.host !== configured.host ||
    requested.projectId !== configured.projectId
  ) {
    return refuse(403);
  }

  try {
    const upstream = await fetch(
      `https://${configured.host}/api/${configured.projectId}/envelope/`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-sentry-envelope' },
        body,
      }
    );
    // 429 keeps its status and backoff headers so the SDK stops sending; other failures stay 502.
    if (upstream.status === 429) return withRateLimitHeaders(429, upstream);
    if (!upstream.ok) return refuse(502);
    const headers = withRateLimitHeaders(upstream.status, upstream).headers;
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers,
    });
  } catch {
    return refuse(502);
  }
}
