import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startImageHost, type ImageHost } from '../support/image-host';

describe('image host fixtures (unit smoke)', () => {
  let host: ImageHost;

  beforeAll(async () => {
    host = await startImageHost();
  });

  afterAll(async () => {
    await host.close();
  });

  it('serves a small valid image', async () => {
    const res = await fetch(`${host.baseUrl}/small.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(0);
    expect(body.byteLength).toBeLessThan(1024);
  });

  it('serves an HTML page for the not-an-image case', async () => {
    const res = await fetch(`${host.baseUrl}/html.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
  });

  it('serves a redirect chain that ends at a private-address destination', async () => {
    const res = await fetch(`${host.baseUrl}/redirect/private`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('169.254.169.254');
  });

  it('serves a 4-hop redirect chain', async () => {
    const res = await fetch(`${host.baseUrl}/redirect/chain-4`, { redirect: 'follow' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });
});
