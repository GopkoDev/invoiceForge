// Sentry tunnel (AC-22): forwards browser envelopes only for the DSN configured for this
// environment; anything else is refused. Nothing is logged or persisted.

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

// Only the header line is decoded; the envelope itself (which may carry compressed binary
// items such as replay recordings) is forwarded byte for byte.
function headerLine(bytes: Uint8Array): string {
  const end = bytes.indexOf(0x0a);
  return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end));
}

export async function POST(request: Request): Promise<Response> {
  const configured = parseDsn(process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (!configured) return refuse(403);

  const body = new Uint8Array(await request.arrayBuffer());
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
    if (!upstream.ok) return refuse(502);
    return new Response(await upstream.text(), { status: upstream.status });
  } catch {
    return refuse(502);
  }
}
