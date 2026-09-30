// T49 R-11 — captured Prisma errors carry no argument values: either the client is built with
// errorFormat 'minimal' or the server Sentry config scrubs events in beforeSend.
import { describe, expect, it, vi } from 'vitest';

describe('Prisma error payloads carry no argument values (T49 R-11)', () => {
  it('errorFormat is minimal or beforeSend scrubs the args', async () => {
    vi.resetModules();
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db');
    vi.stubEnv('SENTRY_DSN', 'https://k@example.ingest.sentry.io/1');
    vi.stubEnv('NODE_ENV', 'production');

    const ctor = vi.fn();
    vi.doMock('@prisma/client', () => ({
      PrismaClient: class {
        constructor(opts: unknown) {
          ctor(opts);
        }
      },
    }));
    vi.doMock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }));
    const init = vi.fn();
    vi.doMock('@sentry/nextjs', () => ({ init }));

    (globalThis as { prisma?: unknown }).prisma = undefined;
    await import('@/prisma');
    await import('@/sentry.server.config');

    const minimal = ctor.mock.calls[0]?.[0]?.errorFormat === 'minimal';
    const beforeSend = init.mock.calls[0]?.[0]?.beforeSend as
      | ((e: unknown) => unknown)
      | undefined;
    let scrubbed = false;
    if (beforeSend) {
      const out = JSON.stringify(
        beforeSend({
          exception: {
            values: [
              { value: 'Invalid `prisma.user.update()` invocation: data: { email: "SECRET-EMAIL" }' },
            ],
          },
        }) ?? {},
      );
      scrubbed = !out.includes('SECRET-EMAIL');
    }
    expect(minimal || scrubbed).toBe(true);
    vi.unstubAllEnvs();
  });
});
