// T12 (security-patch; spec.md §5 AC-15, AC-16, AC-17, AC-19; ADR-0001; api-sync-report OQ-2).
// signInWithEmail maps the typed provider errors (by type, never by message text) to the exported
// constants; sent and limited both end in the same redirect. Nothing about Auth.js is faked: the
// action runs against a real NextAuth() instance (next-auth 5.0.0-beta.32 / @auth/core 0.41.3)
// whose Nodemailer provider carries the real T11 hooks, so these tests pin the error shape the
// installed version really delivers. Only the Next.js request scope (next/headers), the mail
// transport, the verification-token adapter and Sentry are stand-ins.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PrismaClient } from '@prisma/client';
import NextAuth from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import Nodemailer from 'next-auth/providers/nodemailer';
import * as Sentry from '@sentry/nextjs';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import {
  TEST_LIMIT_KEY_SECRET,
  createLimitEvent,
} from '../../support/factories/limit-event';
import {
  createEmailProviderHooks,
  InvalidEmailAddress,
} from '@/lib/auth/email-provider';
import { addressLimitKey } from '@/lib/security/limits/keys';
import { LIMIT_SCOPES } from '@/lib/security/limits/scopes';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  startSpan: (_options: unknown, callback: (span: unknown) => unknown) =>
    callback({ setAttribute: vi.fn(), setAttributes: vi.fn(), end: vi.fn() }),
}));

// The request scope a server action runs in: next-auth's signIn() copies these headers into the
// request it hands to Auth.js (x-real-ip is the platform source address).
let requestIp = '198.51.100.1';
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({
      host: 'localhost:3000',
      'x-forwarded-proto': 'http',
      'x-real-ip': requestIp,
    }),
  cookies: async () => ({ set: () => undefined }),
}));

// '@/auth' is the app's NextAuth() instance; each test points it at one built from a test config.
let authInstance: ReturnType<typeof NextAuth> | null = null;
let signInCalls = 0;
vi.mock('@/auth', () => ({
  signIn: (...args: unknown[]) => {
    signInCalls++;
    return (authInstance!.signIn as (...a: unknown[]) => Promise<unknown>)(
      ...args
    );
  },
}));

process.env.LIMIT_KEY_SECRET = TEST_LIMIT_KEY_SECRET;

const actions = await import('@/lib/actions/login-actions');
const constants = await import('@/lib/auth/sign-in-messages');

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const BASE = 'http://localhost:3000';

interface Mail {
  to: string;
  [k: string]: unknown;
}
type Transport = { mails: Mail[]; sendMail: (m: Mail) => Promise<unknown> };

function fakeTransport(): Transport {
  const mails: Mail[] = [];
  return {
    mails,
    sendMail: async (message) => {
      mails.push(message);
      return { accepted: [message.to] };
    },
  };
}

function failingTransport(message: string): Transport {
  return {
    mails: [],
    sendMail: async () => {
      throw Object.assign(new Error(message), { code: 'ESOCKET' });
    },
  };
}

// Limit store whose database is unreachable (AC-15). The refusal takes a moment, like a real
// connection attempt: @auth/core's sendToken awaits a hash between starting the send and joining
// it in Promise.all, so an instant rejection would be reported as unhandled in the meantime.
const brokenPrisma = {
  $transaction: async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    throw new Error('connection refused');
  },
} as unknown as PrismaClient;

// Verification tokens only; the limit store, not the adapter, is what these tests exercise.
function tokenAdapter(): Adapter {
  return {
    getUserByEmail: async () => null,
    createVerificationToken: async (token) => token,
    useVerificationToken: async () => null,
  } as Adapter;
}

/** A NextAuth() instance wired like auth.ts, with the real T11 hooks on the Nodemailer provider. */
function useAuth(prisma: PrismaClient, transport: Transport) {
  const hooks = createEmailProviderHooks({
    prisma,
    transport,
    floorMs: 20,
    jitterMs: 5,
  });
  authInstance = NextAuth({
    secret: 'test-secret-test-secret-test-secret',
    trustHost: true,
    adapter: tokenAdapter(),
    session: { strategy: 'jwt' },
    pages: {
      signIn: '/login',
      verifyRequest: '/verify-request',
      error: '/error',
    },
    providers: [
      Nodemailer({
        server: { host: 'localhost', port: 2525 },
        from: 'no-reply@example.test',
        normalizeIdentifier: hooks.normalizeIdentifier,
        sendVerificationRequest: hooks.sendVerificationRequest as never,
      }),
    ],
  });
  return authInstance;
}

/** What signInWithEmail did: returned a result, or threw (NEXT_REDIRECT carries a digest). */
async function outcomeOf(email: string) {
  try {
    return { returned: await actions.signInWithEmail(email) };
  } catch (error) {
    return { thrown: error as Error & { digest?: string } };
  }
}

/** POST /api/auth/signin/nodemailer called directly, with a valid CSRF token, via the route handlers. */
async function postDirect(auth: ReturnType<typeof NextAuth>, email: string) {
  type Handler = (r: Request) => Promise<Response>;
  const { GET, POST } = auth.handlers as unknown as {
    GET: Handler;
    POST: Handler;
  };
  const csrfRes = await GET(new Request(`${BASE}/api/auth/csrf`));
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const cookie = csrfRes.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  return POST(
    new Request(`${BASE}/api/auth/signin/nodemailer`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
        'x-real-ip': requestIp,
      },
      body: new URLSearchParams({ email, csrfToken }),
    })
  );
}

const errorRedirect = (code: string) =>
  `${BASE}/error?error=CredentialsSignin&code=${code}`;

beforeEach(() => {
  authInstance = null;
  signInCalls = 0;
  requestIp = '198.51.100.1';
  vi.mocked(Sentry.captureException).mockClear();
});

describe('signInWithEmail outcome mapping (real Auth.js, no database)', () => {
  it('exports the fixed messages (AC-15, AC-16)', () => {
    expect(constants.EMAIL_SIGNIN_UNAVAILABLE).toBe(
      'Sign-in by email is temporarily unavailable. Try again shortly, or sign in with Google.'
    );
    expect(constants.EMAIL_SEND_FAILED).toBe(
      "We couldn't send the sign-in email. Try again."
    );
  });

  it('AC-15: limits unavailable -> FAILED with EMAIL_SIGNIN_UNAVAILABLE, nothing sent', async () => {
    const transport = fakeTransport();
    useAuth(brokenPrisma, transport);
    const { returned, thrown } = await outcomeOf('ana@example.test');
    expect(thrown).toBeUndefined();
    expect(returned).toEqual({
      success: false,
      code: 'FAILED',
      error: constants.EMAIL_SIGNIN_UNAVAILABLE,
    });
    expect(transport.mails).toHaveLength(0);
  });

  it.each([
    ['over 254 characters', `${'a'.repeat(250)}@example.test`],
    ['non-ASCII', 'jürgen@example.test'],
  ])(
    'AC-17: %s is refused on /login before anything is sent',
    async (_label, email) => {
      const transport = fakeTransport();
      useAuth(brokenPrisma, transport);
      const { returned } = await outcomeOf(email);
      expect(returned).toEqual({
        success: false,
        code: 'VALIDATION',
        error: constants.INVALID_EMAIL_ADDRESS,
        fieldErrors: { email: [constants.INVALID_EMAIL_ADDRESS] },
      });
      expect(signInCalls).toBe(0);
      expect(transport.mails).toHaveLength(0);
    }
  );

  it('AC-17: the provider refusal reaches the caller of signIn() as the typed InvalidEmailAddress itself', async () => {
    const auth = useAuth(brokenPrisma, fakeTransport());
    const thrown = await auth
      .signIn('nodemailer', { email: 'jürgen@example.test', redirectTo: '/' })
      .catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(InvalidEmailAddress);
  });

  it('AC-19: Google sign-in still redirects to the provider', async () => {
    // Explicit endpoints instead of OIDC discovery, so nothing leaves the machine. The adapter is
    // there as in auth.ts (and because @auth/core's config check remembers an earlier email
    // provider at module level).
    authInstance = NextAuth({
      secret: 'test-secret-test-secret-test-secret',
      trustHost: true,
      adapter: tokenAdapter(),
      session: { strategy: 'jwt' },
      providers: [
        {
          id: 'google',
          name: 'Google',
          type: 'oauth',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          authorization:
            'https://accounts.google.com/o/oauth2/v2/auth?scope=openid+email',
          token: 'https://oauth2.googleapis.com/token',
          userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
          checks: ['state'],
        } as never,
      ],
    });
    const thrown = (await actions
      .signInWithGoogle()
      .catch((e: unknown) => e)) as {
      digest?: string;
    };
    expect(thrown.digest).toMatch(
      /^NEXT_REDIRECT;\w+;https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/
    );
  });

  describe('OQ-2: the direct endpoint redirects to /error with a distinct code', () => {
    it('AC-17: an invalid address -> /error?error=CredentialsSignin&code=invalid_email', async () => {
      const transport = fakeTransport();
      const res = await postDirect(
        useAuth(brokenPrisma, transport),
        'jürgen@example.test'
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(errorRedirect('invalid_email'));
      expect(transport.mails).toHaveLength(0);
    });

    it('AC-15: limits unavailable -> /error?error=CredentialsSignin&code=email_unavailable', async () => {
      const res = await postDirect(
        useAuth(brokenPrisma, fakeTransport()),
        'ana@example.test'
      );
      expect(res.headers.get('location')).toBe(
        errorRedirect('email_unavailable')
      );
    });
  });
});

describe.runIf(containerRuntimeAvailable)(
  'signInWithEmail outcome mapping (real Auth.js + real DB)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;

    beforeAll(async () => {
      db = await startTestDatabase();
      prisma = createTestPrismaClient(db.connectionString);
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    beforeEach(async () => {
      await truncateAllTables(prisma);
    });

    it.each([
      ['no STARTTLS offered', 'Connection requires STARTTLS'],
      [
        'certificate not valid for the host',
        "Hostname/IP does not match certificate's altnames",
      ],
    ])(
      'AC-16: %s -> FAILED with EMAIL_SEND_FAILED, reported to Sentry',
      async (_label, message) => {
        useAuth(prisma, failingTransport(message));
        const { returned, thrown } = await outcomeOf('ana@example.test');
        expect(thrown).toBeUndefined();
        expect(returned).toEqual({
          success: false,
          code: 'FAILED',
          error: constants.EMAIL_SEND_FAILED,
        });
        expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      }
    );

    it('AC-16 (OQ-2): a send failure on the direct endpoint -> /error?error=CredentialsSignin&code=send_failed', async () => {
      const res = await postDirect(
        useAuth(prisma, failingTransport('Connection requires STARTTLS')),
        'ana@example.test'
      );
      expect(res.headers.get('location')).toBe(errorRedirect('send_failed'));
    });

    it('AC-19: sent and limited both rethrow the same redirect to /verify-request', async () => {
      const transport = fakeTransport();
      useAuth(prisma, transport);

      requestIp = '198.51.100.20';
      const sent = await outcomeOf('ana@example.test');

      for (let i = 0; i < LIMIT_SCOPES.SIGNIN_ADDRESS.max; i++) {
        await createLimitEvent(prisma, {
          scope: 'SIGNIN_ADDRESS',
          key: addressLimitKey('bob@example.test'),
          outcome: 'SENT',
          at: new Date(Date.now() - 60_000),
        });
      }
      requestIp = '198.51.100.21';
      const limited = await outcomeOf('bob@example.test');

      expect(transport.mails.map((m) => m.to)).toEqual(['ana@example.test']);
      expect(sent.returned).toBeUndefined();
      expect(limited.returned).toBeUndefined();
      // Auth.js's own verify-request route, which forwards to pages.verifyRequest (/verify-request).
      expect(sent.thrown?.digest).toMatch(
        /^NEXT_REDIRECT;\w+;http:\/\/localhost:3000\/api\/auth\/verify-request\?/
      );
      expect(limited.thrown?.digest).toBe(sent.thrown?.digest);
    });
  }
);
