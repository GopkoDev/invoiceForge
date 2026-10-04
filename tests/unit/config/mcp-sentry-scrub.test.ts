import { describe, expect, it } from 'vitest';
import { scrubMcpRequest } from '@/sentry.server.config';

describe('scrubMcpRequest (T12, sad.md §8)', () => {
  it('drops headers, cookies and body of an /api/mcp event', () => {
    const event = scrubMcpRequest({
      request: {
        url: 'https://app.example/api/mcp',
        headers: { authorization: 'Bearer ifk_secret' },
        cookies: { a: 'b' },
        data: '{"x":1}',
      },
    });
    expect(JSON.stringify(event)).not.toContain('ifk_secret');
    expect(event.request).toEqual({ url: 'https://app.example/api/mcp' });
  });

  it('leaves other requests alone', () => {
    const event = scrubMcpRequest({
      request: { url: 'https://app.example/api/other', headers: { a: 'b' } },
    });
    expect(event.request?.headers).toEqual({ a: 'b' });
  });
});
