import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// AC-20 (T19): the enforced CSP and transport headers are served from next.config.ts headers().
const TEST_DSN = 'https://abc123key@o42.ingest.sentry.io/4567';
const REPORT_URI =
  'https://o42.ingest.sentry.io/api/4567/security/?sentry_key=abc123key';

const EXPECTED_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
];

type Entry = { source: string; headers: { key: string; value: string }[] };

async function loadHeaders(dsn: string, nodeEnv?: string) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', dsn);
  if (nodeEnv) vi.stubEnv('NODE_ENV', nodeEnv);
  const mod = await import('../../next.config');
  const config = mod.default as { headers?: () => Promise<Entry[]> };
  expect(typeof config.headers, 'next.config.ts must define headers()').toBe(
    'function'
  );
  const entries = await config.headers!();
  const entry = entries.find((e) => e.source === '/(.*)');
  expect(entry, "headers() must have a '/(.*)' entry").toBeDefined();
  return new Map(entry!.headers.map((h) => [h.key, h.value]));
}

afterEach(() => vi.unstubAllEnvs());

describe('security headers (AC-20)', () => {
  it('enforces the exact CSP directives and report endpoint', async () => {
    const h = await loadHeaders(TEST_DSN);
    expect(h.has('Content-Security-Policy-Report-Only')).toBe(false);
    const csp = h.get('Content-Security-Policy')!;
    expect(csp).toBeDefined();
    const directives = csp.split(';').map((d) => d.trim());
    for (const d of EXPECTED_DIRECTIVES) expect(directives).toContain(d);
    expect(directives).toContain(`report-uri ${REPORT_URI}`);
    expect(directives.some((d) => d.startsWith('report-to '))).toBe(true);
    expect(h.get('Reporting-Endpoints')).toContain(REPORT_URI);
  });

  it('sets transport and browser headers', async () => {
    const h = await loadHeaders(TEST_DSN);
    expect(h.get('Strict-Transport-Security')).toBe('max-age=63072000');
    expect(h.get('Permissions-Policy')).toBe(
      'camera=(), microphone=(), geolocation=(), payment=()'
    );
    expect(h.get('X-XSS-Protection')).toBe('0');
    expect(h.get('X-Content-Type-Options')).toBe('nosniff');
    expect(h.get('X-Frame-Options')).toBe('DENY');
    expect(h.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('still enforces the CSP but omits report directives without a DSN', async () => {
    const h = await loadHeaders('');
    const csp = h.get('Content-Security-Policy')!;
    expect(csp).toBeDefined();
    const directives = csp.split(';').map((x) => x.trim());
    for (const d of EXPECTED_DIRECTIVES) expect(directives).toContain(d);
    expect(csp).not.toMatch(/report-uri|report-to/);
  });

  it('keeps production script-src exact: WebAssembly compile for the PDF renderer, no JS eval, no third-party script host', async () => {
    const h = await loadHeaders(TEST_DSN, 'production');
    const directives = h
      .get('Content-Security-Policy')!
      .split(';')
      .map((d) => d.trim());
    for (const d of EXPECTED_DIRECTIVES) expect(directives).toContain(d);
    expect(directives.filter((d) => d.startsWith('script-src '))).toEqual([
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    ]);
  });

  it('relaxes script-src only under next dev for React eval and the analytics debug scripts', async () => {
    const h = await loadHeaders('', 'development');
    const directives = h
      .get('Content-Security-Policy')!
      .split(';')
      .map((d) => d.trim());
    expect(directives.filter((d) => d.startsWith('script-src '))).toEqual([
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval' https://va.vercel-scripts.com",
    ]);
    for (const d of EXPECTED_DIRECTIVES.filter(
      (x) => !x.startsWith('script-src ')
    )) {
      expect(directives).toContain(d);
    }
  });

  it('removes the headers block from vercel.json and keeps the other keys', () => {
    const vercel = JSON.parse(
      readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')
    );
    expect(vercel).not.toHaveProperty('headers');
    expect(vercel.buildCommand).toBe('pnpm build');
  });
});
