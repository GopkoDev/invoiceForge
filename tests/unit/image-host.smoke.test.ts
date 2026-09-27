import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import https from 'node:https';
import { startImageHost, type ImageHost } from '../support/image-host';

const FIXTURE_HOSTNAME = 'logo-fixture.example.test';

interface SimpleResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: Buffer;
}

// The fixture host's cert is only valid for FIXTURE_HOSTNAME (its SAN), while we connect via the
// literal loopback IP - so `servername` is pinned to the fixture hostname (matching the real
// safe-fetcher's pinned-address + hostname-verified-via-servername design) and `ca` trusts the
// fixture's self-signed root. Certificate verification is never disabled.
function request(
  host: ImageHost,
  pathname: string,
  opts: { redirect?: 'manual' | 'follow'; hopsLeft?: number } = {}
): Promise<SimpleResponse> {
  const { redirect = 'manual', hopsLeft = 10 } = opts;
  const port = new URL(host.baseUrl).port;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: '127.0.0.1',
        port: Number(port),
        path: pathname,
        servername: FIXTURE_HOSTNAME,
        ca: host.ca,
        rejectUnauthorized: true,
        headers: { Host: FIXTURE_HOSTNAME },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (redirect === 'follow' && status >= 300 && status < 400 && location) {
          res.resume();
          if (hopsLeft <= 0) {
            reject(new Error('too many redirects'));
            return;
          }
          const next = new URL(location, `https://${FIXTURE_HOSTNAME}:${port}`);
          resolve(request(host, `${next.pathname}${next.search}`, { redirect, hopsLeft: hopsLeft - 1 }));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status,
            headers: {
              'content-type': res.headers['content-type'],
              location: res.headers.location,
            },
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('image host fixtures (unit smoke)', () => {
  let host: ImageHost;

  beforeAll(async () => {
    host = await startImageHost();
  });

  afterAll(async () => {
    await host.close();
  });

  it('serves a small valid image', async () => {
    const res = await request(host, '/small.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.body.byteLength).toBeGreaterThan(0);
    expect(res.body.byteLength).toBeLessThan(1024);
  });

  it('serves an HTML page for the not-an-image case', async () => {
    const res = await request(host, '/html.html');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html');
  });

  it('serves a redirect chain that ends at a private-address destination', async () => {
    const res = await request(host, '/redirect/private', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('169.254.169.254');
  });

  it('serves a 4-hop redirect chain', async () => {
    const res = await request(host, '/redirect/chain-4', { redirect: 'follow' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });
});
