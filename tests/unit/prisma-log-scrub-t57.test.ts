// T57 (review-2026-09-30-3.md U-01; sad.md §8 "No request body or bank detail is logged") — a
// Prisma error message carries the rendered call arguments, and `console.error(ctx, error)` writes
// all of it to the server logs. Every server log site that can receive a Prisma error logs a
// redacted form instead. Each case feeds a REAL PrismaClientValidationError into the site and
// checks the console output the way Node renders it (util.inspect), not through JSON.stringify.
import { inspect } from 'node:util';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const EMAIL = 'SECRET-EMAIL@x.com';
const IBAN = 'SECRET-IBAN-DE00';
const MARKERS = [EMAIL, IBAN];

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock(), signOut: vi.fn() }));

const prismaMock = {
  user: { findUnique: vi.fn() },
  invoice: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  senderProfile: { findFirst: vi.fn(), findMany: vi.fn() },
  account: { findMany: vi.fn() },
  emailHistory: { findMany: vi.fn() },
  customer: { findMany: vi.fn() },
  product: { findMany: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock('@/prisma', () => ({ prisma: prismaMock }));

const consumeLogoFetchMock = vi.fn();
vi.mock('@/lib/security/logo-rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security/logo-rate-limit')>()),
  consumeLogoFetch: (...a: unknown[]) => consumeLogoFetchMock(...a),
}));

let realError: Error;
let consoleError: { mock: { calls: unknown[][] } };
let consoleLog: { mock: { calls: unknown[][] } };

beforeAll(async () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: 'postgresql://u:p@127.0.0.1:1/db',
    }),
  });
  try {
    await (
      client as unknown as {
        senderProfile: { update: (a: unknown) => Promise<unknown> };
      }
    ).senderProfile.update({
      where: { id: 'x' },
      data: { email: EMAIL, iban: IBAN, bogus: 1 },
    });
  } catch (e) {
    realError = e as Error;
  }
  await client.$disconnect().catch(() => undefined);
});

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

/** The server log as Node would print it: every console argument rendered by util.inspect. */
function logged(): string {
  return [...consoleError.mock.calls, ...consoleLog.mock.calls]
    .map((args: unknown[]) =>
      args
        .map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 10 })))
        .join(' ')
    )
    .join('\n');
}

function expectRedactedLog() {
  const out = logged();
  expect(out).not.toBe('');
  for (const m of MARKERS) expect(out).not.toContain(m);
  expect(out).toContain('PrismaClientValidationError');
  // The invocation line stays for triage; outside production Prisma renders the call site into it.
  expect(out).toMatch(/Invalid `[^`]*senderProfile\.update\(\)` invocation/);
}

describe('Prisma call arguments never reach the server logs (T57 U-01)', () => {
  it('the fixture is a real error whose message and inspect output contain the argument values', () => {
    expect(realError.constructor.name).toBe('PrismaClientValidationError');
    for (const m of MARKERS) expect(inspect(realError)).toContain(m);
  });

  it('failed() logs a redacted form of the error', async () => {
    const { failed } = await import('@/lib/actions/action-result-helpers');
    failed('updateSenderProfile failed', realError, 'Something went wrong.');
    expectRedactedLog();
  });

  it('getAccountDeletionSummary logs a redacted form of the error', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prismaMock.invoice.count.mockRejectedValue(realError);
    const { getAccountDeletionSummary } =
      await import('@/lib/actions/account-actions');
    await getAccountDeletionSummary();
    expectRedactedLog();
  });

  it('deleteUserAccount logs a redacted form of the error', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    prismaMock.user.findUnique.mockRejectedValue(realError);
    const { deleteUserAccount } = await import('@/lib/actions/account-actions');
    await deleteUserAccount();
    expectRedactedLog();
  });

  it('the data export route logs a redacted form of the error', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'user-1' })
      .mockRejectedValueOnce(realError);
    const { GET } = await import('@/app/api/user/export/route');
    const res = await GET();
    expect(res.status).toBe(500);
    expectRedactedLog();
  });

  it('the logo route logs a redacted form of a rate-limit store error', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prismaMock.senderProfile.findFirst.mockResolvedValue({
      logo: 'https://example.com/logo.png',
    });
    consumeLogoFetchMock.mockRejectedValue(realError);
    const { POST } = await import('@/app/api/convert-image/route');
    const { NextRequest } = await import('next/server');
    const res = await POST(
      new NextRequest('http://localhost/api/convert-image', {
        method: 'POST',
        body: JSON.stringify({ senderProfileId: 'sp-1' }),
      })
    );
    expect(res.status).toBe(502);
    expectRedactedLog();
  });

  it('the rate limiter logs a redacted form of a cleanup error', async () => {
    const { createLogoRateLimiter } =
      await import('@/lib/security/logo-rate-limit');
    const fakePrisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([]),
      $executeRaw: vi.fn().mockRejectedValue(realError),
    };
    const limiter = createLogoRateLimiter({
      prisma: fakePrisma as unknown as PrismaClient,
      clock: { now: () => new Date('2026-09-30T12:00:30Z') },
    });
    await expect(limiter.consumeLogoFetch('user-1')).resolves.toEqual({
      allowed: true,
    });
    expectRedactedLog();
  });

  it('requireSession logs a redacted form of an auth() error', async () => {
    authMock.mockRejectedValue(realError);
    const { requireSession } = await import('@/lib/helpers/route-auth');
    const result = await requireSession();
    expect(result.ok).toBe(false);
    expectRedactedLog();
  });

  it('requireLiveUser logs a redacted form of an auth() error', async () => {
    authMock.mockRejectedValue(realError);
    const { requireLiveUser } = await import('@/lib/helpers/route-auth');
    await requireLiveUser().catch(() => undefined);
    expectRedactedLog();
  });

  it('a request error keeps its reason and code in the log line (T58 U-03)', async () => {
    const { Prisma } = await import('@prisma/client');
    const known = new Prisma.PrismaClientKnownRequestError(
      "\nInvalid `prisma.user.findUnique()` invocation:\n\n\nCan't reach database server at `db:5432`",
      { code: 'P1001', clientVersion: '7.2.0' }
    );
    const { failed } = await import('@/lib/actions/action-result-helpers');
    failed('getProducts failed', known, 'Something went wrong.');
    expect(logged()).toContain('PrismaClientKnownRequestError [P1001]');
    expect(logged()).toContain("Can't reach database server");
  });

  // T61 V-02: the reason is kept only for codes whose message holds no values. The pg adapter
  // builds a P2007 reason from the driver message, which quotes the rejected input.
  it('a request error whose code may quote a value loses its reason (T61 V-02)', async () => {
    const { Prisma } = await import('@prisma/client');
    const { redactError } = await import('@/lib/helpers/prisma-error-scrub');
    const invalid = new Prisma.PrismaClientKnownRequestError(
      `\nInvalid \`prisma.invoice.findUnique()\` invocation:\n\n\nInvalid input value: invalid input syntax for type uuid: "${EMAIL}"`,
      { code: 'P2007', clientVersion: '7.2.0' }
    );
    expect(inspect(invalid)).toContain(EMAIL);
    const out = inspect(redactError(invalid));
    expect(out).not.toContain(EMAIL);
    expect(out).toContain('PrismaClientKnownRequestError [P2007]');
    expect(out).toContain('Invalid `prisma.invoice.findUnique()` invocation');
  });

  // T63 W-01: adapter-pg reads the P2011 field list with /Key \(([^)]+)\)/ from a 23502 detail,
  // which is `Failing row contains (<every column value>)`, so a match can only be user data.
  it('a null-constraint error loses its reason, which can quote a row value (T63 W-01)', async () => {
    const { Prisma } = await import('@prisma/client');
    const { redactError } = await import('@/lib/helpers/prisma-error-scrub');
    const nullViolation = new Prisma.PrismaClientKnownRequestError(
      `\nInvalid \`prisma.invoice.create()\` invocation:\n\n\nNull constraint violation on the fields: (\`${IBAN}\`)`,
      { code: 'P2011', clientVersion: '7.2.0' }
    );
    expect(inspect(nullViolation)).toContain(IBAN);
    const out = inspect(redactError(nullViolation));
    expect(out).not.toContain(IBAN);
    expect(out).toContain('PrismaClientKnownRequestError [P2011]');
    expect(out).toContain('Invalid `prisma.invoice.create()` invocation');
  });

  it('a unique-constraint error keeps its reason, which names columns only (T61 V-02)', async () => {
    const { Prisma } = await import('@prisma/client');
    const { redactError } = await import('@/lib/helpers/prisma-error-scrub');
    const unique = new Prisma.PrismaClientKnownRequestError(
      '\nInvalid `prisma.user.create()` invocation:\n\n\nUnique constraint failed on the fields: (`email`)',
      { code: 'P2002', clientVersion: '7.2.0' }
    );
    expect(inspect(redactError(unique))).toContain(
      'Unique constraint failed on the fields: (`email`)'
    );
  });

  // T64 W-02: at a model call site Prisma 7.2's RequestHandler rethrows an initialization error
  // with the invocation context but without its errorCode
  // (`new PrismaClientInitializationError(message, clientVersion)`), so it has no code to allow
  // its reason and the reason is cut.
  it('a call-site initialization error, which carries no errorCode, loses its reason (T64 W-02)', async () => {
    const { Prisma } = await import('@prisma/client');
    const { redactError } = await import('@/lib/helpers/prisma-error-scrub');
    const init = new Prisma.PrismaClientInitializationError(
      "\nInvalid `prisma.user.findUnique()` invocation:\n\n\nCan't reach database server at `db:5432`",
      '7.2.0'
    );
    expect(init.errorCode).toBeUndefined();
    const out = redactError(init);
    expect(out).toBe(
      'PrismaClientInitializationError: \nInvalid `prisma.user.findUnique()` invocation [arguments redacted]'
    );
  });

  // T65 X-01: the errorCode survives only on an initialization error thrown at client start-up,
  // whose message has no invocation line. In Prisma 7.2 the ClientEngine constructor throws
  // this one with code P2038 when no driver adapter is configured. An unreachable database is
  // not a start-up error here: adapter-pg connects its pool lazily, so it fails at query time as
  // a PrismaClientKnownRequestError P1001. The log line carries the same code as the Sentry
  // prisma_code tag.
  it('a start-up initialization error keeps its errorCode label (T64 W-02, T65 X-01)', async () => {
    const { Prisma } = await import('@prisma/client');
    const { redactError } = await import('@/lib/helpers/prisma-error-scrub');
    const message =
      'Missing configured driver adapter. Engine type `client` requires an active driver adapter. Please check your PrismaClient initialization code.';
    const init = new Prisma.PrismaClientInitializationError(message, '7.2.0', 'P2038');
    expect(redactError(init)).toBe(`PrismaClientInitializationError [P2038]: ${message}`);
  });

  // T62 V-03: the cause chain, a string argument and a validation error without an invocation line
  // each take their own branch in redactError. Here every console argument goes through
  // util.inspect, strings included, so nothing hides behind the string shortcut in logged().
  it('failed() redacts a Prisma error carried as the cause of a plain Error (T62 V-03)', async () => {
    const { failed } = await import('@/lib/actions/action-result-helpers');
    failed(
      'updateSenderProfile failed',
      new Error('outer', { cause: realError }),
      'Something went wrong.'
    );
    const out = consoleError.mock.calls
      .flat()
      .map((a) => inspect(a, { depth: 10 }))
      .join('\n');
    for (const m of MARKERS) expect(out).not.toContain(m);
    expect(out).toContain('outer');
    expect(out).toContain('[cause] PrismaClientValidationError');
  });

  it('a string holding the invocation text comes back scrubbed (T62 V-03)', async () => {
    const { redactError } = await import('@/lib/helpers/prisma-error-scrub');
    for (const m of MARKERS) expect(realError.message).toContain(m);
    const out = redactError(realError.message);
    expect(typeof out).toBe('string');
    for (const m of MARKERS) expect(out).not.toContain(m);
    expect(out).toMatch(
      /Invalid `[^`]*senderProfile\.update\(\)` invocation \[arguments redacted\]$/
    );
  });

  it('a validation error without an invocation line logs no message text (T62 V-03)', async () => {
    const { Prisma } = await import('@prisma/client');
    const { redactError } = await import('@/lib/helpers/prisma-error-scrub');
    const bare = new Prisma.PrismaClientValidationError(
      `boom\n{ email: "${EMAIL}" }`,
      { clientVersion: '7.2.0' }
    );
    expect(redactError(bare)).toBe(
      'PrismaClientValidationError: [arguments redacted]'
    );
  });

  it('a non-Prisma error is still logged in full', async () => {
    const { failed } = await import('@/lib/actions/action-result-helpers');
    failed('getProducts failed', new Error('db down'), 'Something went wrong.');
    expect(logged()).toContain('db down');
  });
});
