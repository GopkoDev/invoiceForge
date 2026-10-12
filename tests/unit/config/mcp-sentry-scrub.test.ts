import { describe, expect, it } from 'vitest';
import { hasPrivateBody, scrubPrivateRequest } from '@/sentry.server.config';

describe('scrubPrivateRequest (T12, sad.md §8)', () => {
  it('drops headers, cookies and body of an /api/mcp event', () => {
    const event = scrubPrivateRequest({
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
    const event = scrubPrivateRequest({
      request: { url: 'https://app.example/api/other', headers: { a: 'b' } },
    });
    expect(event.request?.headers).toEqual({ a: 'b' });
  });
});

describe('the chat body never reaches Sentry (security review L-01, spec §6.1)', () => {
  it('drops the body and cookies of an /api/chat event, keeping the headers', () => {
    const event = scrubPrivateRequest({
      request: {
        url: 'https://app.example/api/chat',
        headers: { 'content-type': 'application/json' },
        cookies: { session: 's' },
        data: '{"message":{"parts":[{"type":"text","text":"invoice Acme 600 EUR"}]}}',
      },
    });
    expect(JSON.stringify(event)).not.toContain('Acme');
    expect(event.request).toEqual({
      url: 'https://app.example/api/chat',
      headers: { 'content-type': 'application/json' },
    });
  });

  it.each([
    '/api/chat',
    '/api/chat/',
    '/api/%63hat',
    'https://app.example/api/chat?x=1',
  ])('the incoming body of %s is never attached', (url) => {
    expect(hasPrivateBody(url)).toBe(true);
  });

  it.each(['/api/mcp', '/api/%6Dcp'])('nor that of %s', (url) => {
    expect(hasPrivateBody(url)).toBe(true);
  });

  it('other routes keep the default', () => {
    expect(hasPrivateBody('/api/user/export')).toBe(false);
  });
});
