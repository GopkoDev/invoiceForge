// AC-22: POST /monitoring forwards Sentry envelopes only for the configured DSN.
// No database needed; upstream fetch is stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OWN_DSN = 'https://publickey@o123.ingest.sentry.io/4500001';
const ENVELOPE_URL = 'https://o123.ingest.sentry.io/api/4500001/envelope/';

function envelope(dsn: string | undefined): string {
  const header = JSON.stringify(
    dsn === undefined ? { event_id: 'abc' } : { event_id: 'abc', dsn }
  );
  return `${header}\n{"type":"event"}\n{"message":"boom"}`;
}

function post(body: string | Uint8Array<ArrayBuffer>): Request {
  return new Request('http://localhost/monitoring', {
    method: 'POST',
    headers: { 'content-type': 'application/x-sentry-envelope' },
    body,
  });
}

async function loadRoute() {
  return (await import('@/app/monitoring/route')) as {
    POST: (req: Request) => Promise<Response>;
  };
}

describe('POST /monitoring (AC-22)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', OWN_DSN);
    fetchMock = vi.fn(
      async () => new Response('{"id":"abc"}', { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('forwards an envelope for the configured DSN once and passes the 200 through', async () => {
    const { POST } = await loadRoute();
    const res = await POST(post(envelope(OWN_DSN)));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(ENVELOPE_URL);
    expect(await res.text()).toBe('{"id":"abc"}');
  });

  it('forwards a binary (non-UTF-8) payload after the header byte for byte', async () => {
    const header = new TextEncoder().encode(
      `${JSON.stringify({ event_id: 'abc', dsn: OWN_DSN })}\n{"type":"replay_recording","length":6}\n`
    );
    const payload = new Uint8Array([0xff, 0xfe, 0x80, 0x00, 0xc3, 0x28]);
    const sent = new Uint8Array(header.length + payload.length);
    sent.set(header, 0);
    sent.set(payload, header.length);

    const { POST } = await loadRoute();
    const res = await POST(post(sent));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const forwarded = new Uint8Array(
      await new Response(init.body).arrayBuffer()
    );
    expect(Array.from(forwarded)).toEqual(Array.from(sent));
  });

  it.each([
    [
      'another project id on the same host',
      'https://publickey@o123.ingest.sentry.io/999',
    ],
    [
      'the right project id on another host',
      'https://publickey@evil.example.com/4500001',
    ],
  ])('refuses %s with 403 and forwards nothing', async (_name, dsn) => {
    const { POST } = await loadRoute();
    const res = await POST(post(envelope(dsn)));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing dsn', envelope(undefined)],
    ['garbage first line', 'not json\n{}\n{}'],
    ['empty body', ''],
  ])('refuses %s with 403 and forwards nothing', async (_name, body) => {
    const { POST } = await loadRoute();
    const res = await POST(post(body));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses everything when NEXT_PUBLIC_SENTRY_DSN is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    const { POST } = await loadRoute();
    const res = await POST(post(envelope(OWN_DSN)));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 502 with an empty body when Sentry returns 500, without retrying', async () => {
    fetchMock.mockResolvedValue(
      new Response('upstream detail', { status: 500 })
    );
    const { POST } = await loadRoute();
    const res = await POST(post(envelope(OWN_DSN)));
    expect(res.status).toBe(502);
    expect(await res.text()).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('answers 502 when Sentry is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const { POST } = await loadRoute();
    const res = await POST(post(envelope(OWN_DSN)));
    expect(res.status).toBe(502);
    expect(await res.text()).toBe('');
  });

  it('refuses a body over 1 MB with 413 and forwards nothing', async () => {
    const header = `${JSON.stringify({ event_id: 'abc', dsn: OWN_DSN })}\n`;
    const big = header + 'x'.repeat(1_048_576);
    const { POST } = await loadRoute();
    const res = await POST(post(big));
    expect(res.status).toBe(413);
    expect(await res.text()).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an oversized body by its declared length without reading it', async () => {
    const req = new Request('http://localhost/monitoring', {
      method: 'POST',
      headers: { 'content-length': '5000000' },
      body: envelope(OWN_DSN),
    });
    const { POST } = await loadRoute();
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a body just under the cap', async () => {
    const header = `${JSON.stringify({ event_id: 'abc', dsn: OWN_DSN })}\n`;
    const { POST } = await loadRoute();
    const res = await POST(post(header + 'x'.repeat(1_000_000)));
    expect(res.status).toBe(200);
  });

  it('passes a Sentry 429 through with Retry-After and X-Sentry-Rate-Limits', async () => {
    fetchMock.mockResolvedValue(
      new Response('upstream detail', {
        status: 429,
        headers: {
          'retry-after': '60',
          'x-sentry-rate-limits': '60:error:organization',
        },
      })
    );
    const { POST } = await loadRoute();
    const res = await POST(post(envelope(OWN_DSN)));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(res.headers.get('x-sentry-rate-limits')).toBe(
      '60:error:organization'
    );
    expect(await res.text()).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passes rate-limit headers through on a 200 as well', async () => {
    fetchMock.mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'x-sentry-rate-limits': '30:transaction:key' },
      })
    );
    const { POST } = await loadRoute();
    const res = await POST(post(envelope(OWN_DSN)));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-sentry-rate-limits')).toBe('30:transaction:key');
  });

  it('exports POST only', async () => {
    const mod = (await loadRoute()) as Record<string, unknown>;
    expect(mod.GET).toBeUndefined();
  });
});
