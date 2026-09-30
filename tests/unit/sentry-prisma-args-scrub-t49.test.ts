// T49 R-11 / T54 S-01, S-02 — Prisma error messages carry the rendered call arguments (even with
// errorFormat 'minimal'), so the server Sentry config scrubs them from events and console
// breadcrumbs. The message here comes from a REAL PrismaClientValidationError, and the real
// beforeSend / beforeBreadcrumb handlers registered by sentry.server.config.ts scrub it.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const EMAIL = 'SECRET-EMAIL@x.com';
const BOGUS = 'SECRET-BOGUS-VALUE';
const MARKERS = [EMAIL, BOGUS];

type Handler = (arg: unknown, hint?: unknown) => unknown;
let beforeSend: Handler;
let beforeBreadcrumb: Handler;
let realError: Error;

beforeAll(async () => {
  // A real validation error: the client validates arguments before it ever touches the network.
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: 'postgresql://u:p@127.0.0.1:1/db' }),
    errorFormat: 'minimal',
  });
  try {
    await (client as unknown as { user: { update: (a: unknown) => Promise<unknown> } }).user.update({
      where: { id: 'x' },
      data: { email: EMAIL, bogus: BOGUS },
    });
  } catch (e) {
    realError = e as Error;
  }
  await client.$disconnect().catch(() => undefined);

  vi.resetModules();
  vi.stubEnv('SENTRY_DSN', 'https://k@example.ingest.sentry.io/1');
  vi.stubEnv('NODE_ENV', 'production');
  const init = vi.fn();
  vi.doMock('@sentry/nextjs', () => ({ init }));
  await import('@/sentry.server.config');
  const opts = init.mock.calls[0]?.[0] as { beforeSend?: Handler; beforeBreadcrumb?: Handler };
  beforeSend = opts.beforeSend as Handler;
  beforeBreadcrumb = opts.beforeBreadcrumb as Handler;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('Prisma call arguments never reach Sentry (T54 S-01, S-02)', () => {
  it('the fixture is a real error whose message really contains the argument values', () => {
    expect(realError.constructor.name).toBe('PrismaClientValidationError');
    for (const m of MARKERS) expect(realError.message).toContain(m);
  });

  it('registers both handlers', () => {
    expect(typeof beforeSend).toBe('function');
    expect(typeof beforeBreadcrumb).toBe('function');
  });

  it('beforeSend cuts exception values and the event message after the invocation line', () => {
    const out = beforeSend({
      message: `createInvoice failed ${realError.message}`,
      exception: {
        values: [{ type: 'PrismaClientValidationError', value: realError.message }],
      },
    }) as { message: string; exception: { values: { value: string }[] } };
    const json = JSON.stringify(out);
    for (const m of MARKERS) expect(json).not.toContain(m);
    expect(out.exception.values[0].value).toContain('Invalid `prisma.user.update()` invocation');
  });

  it('beforeSend scrubs a PrismaClientValidationError whose message lacks the invocation line', () => {
    const out = beforeSend({
      exception: {
        values: [{ type: 'PrismaClientValidationError', value: `boom\n{ email: "${EMAIL}" }` }],
      },
    });
    expect(JSON.stringify(out)).not.toContain(EMAIL);
  });

  it('beforeSend leaves unrelated events untouched', () => {
    const event = { message: 'plain', exception: { values: [{ type: 'Error', value: 'nope' }] } };
    expect(beforeSend(structuredClone(event))).toEqual(event);
  });

  it('beforeBreadcrumb scrubs console crumbs (message and captured arguments)', () => {
    const out = beforeBreadcrumb({
      category: 'console',
      level: 'error',
      message: `createInvoice failed ${realError.message}`,
      data: { arguments: ['createInvoice failed', realError.message, realError] },
    });
    const json = JSON.stringify(out);
    for (const m of MARKERS) expect(json).not.toContain(m);
    expect(json).toContain('Invalid `prisma.user.update()` invocation');
  });

  it('beforeBreadcrumb leaves non-console crumbs untouched', () => {
    const crumb = { category: 'http', message: 'GET /x' };
    expect(beforeBreadcrumb({ ...crumb })).toEqual(crumb);
  });
});
