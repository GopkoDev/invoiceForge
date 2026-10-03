// T11 (security-patch; spec.md §5 AC-03, AC-11..AC-17; sad.md §6 flow 1 + response floor).
// The Auth.js email provider hooks (normalizeIdentifier + sendVerificationRequest) are the one
// enforcement point for the address rule, the sign-in-email limits, the response floor and the
// TLS-only send. Contract this test fixes for lib/auth/email-provider.ts:
//   createEmailProviderHooks({ prisma, transport, clock?, floorMs?, jitterMs? })
//     -> { normalizeIdentifier(identifier), sendVerificationRequest(params) }
//   typed errors: InvalidEmailAddress, EmailSigninUnavailable, EmailSendFailed (error.name = class name)
//   transport: { sendMail(message): Promise<unknown> }  (production default = T10's verified-TLS config)
//   the source comes from the platform address of params.request (x-real-ip), never a client header.
// T26 (review F-17..F-21): the source is admitted in callbacks.signIn (signInCallback), before
// Auth.js creates a VerificationToken; the address limit reserves the SENT row and commits before
// the send, which runs outside the lock and releases the row when it fails.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
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
import { PrismaAdapter } from '@auth/prisma-adapter';
import Nodemailer from 'next-auth/providers/nodemailer';
import * as Sentry from '@sentry/nextjs';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import {
  TEST_LIMIT_KEY_SECRET,
  createLimitEvent,
} from '../../support/factories/limit-event';
import { createEmailProviderHooks } from '@/lib/auth/email-provider';
import { addressLimitKey, sourceLimitKey } from '@/lib/security/limits/keys';
import authConfig from '@/auth.config';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  startSpan: (_options: unknown, callback: (span: unknown) => unknown) =>
    callback({ setAttribute: vi.fn(), setAttributes: vi.fn(), end: vi.fn() }),
}));

process.env.LIMIT_KEY_SECRET = TEST_LIMIT_KEY_SECRET;

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const require_ = createRequire(import.meta.url);
const FLOOR_MS = 120;
const JITTER_MS = 20;
// The timing NFR allows 150 ms between medians, so the floor it runs with must be well above
// that: a limited path without the floor, or a send that adds to the floor, then breaks the bound.
const TIMING_FLOOR_MS = 600;
const BASE = 'http://localhost:3000';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Mail {
  to: string;
  [k: string]: unknown;
}

function fakeTransport(latency: () => number = () => 0) {
  const mails: Mail[] = [];
  return {
    mails,
    sendMail: async (message: Mail) => {
      await sleep(latency());
      mails.push(message);
      return { accepted: [message.to] };
    },
  };
}

const failingTransport = (message: string) => ({
  sendMail: async (): Promise<unknown> => {
    throw Object.assign(new Error(message), { code: 'ESOCKET' });
  },
});

function linkRequest(headers: Record<string, string>): Request {
  return new Request(`${BASE}/api/auth/signin/nodemailer`, {
    method: 'POST',
    headers,
  });
}

function params(
  identifier: string,
  ip: string,
  extraHeaders: Record<string, string> = {}
) {
  return {
    identifier,
    url: `${BASE}/api/auth/callback/nodemailer?token=t`,
    expires: new Date(Date.now() + 86_400_000),
    token: 't',
    provider: { from: 'no-reply@example.test', server: {} },
    theme: {},
    request: linkRequest({ 'x-real-ip': ip, ...extraHeaders }),
  };
}

describe.runIf(containerRuntimeAvailable)(
  'T11 email provider hooks (real DB)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;

    type Hooks = ReturnType<typeof createEmailProviderHooks>;
    const hooksWith = (
      transport: { sendMail: (m: Mail) => Promise<unknown> },
      floorMs = FLOOR_MS
    ): Hooks =>
      createEmailProviderHooks({
        prisma,
        transport,
        floorMs,
        jitterMs: JITTER_MS,
      });

    const send = (hooks: Hooks, email: string, ip: string) =>
      hooks.sendVerificationRequest(params(email, ip) as never);

    const rows = (scope: 'SIGNIN_SOURCE' | 'SIGNIN_ADDRESS', key: string) =>
      prisma.limitEvent.findMany({ where: { scope, key } });

    const seedSent = async (email: string, n: number) => {
      for (let i = 0; i < n; i++) {
        await createLimitEvent(prisma, {
          scope: 'SIGNIN_ADDRESS',
          key: addressLimitKey(email),
          outcome: 'SENT',
          at: new Date(Date.now() - 60_000),
        });
      }
    };

    // Drives the real Auth.js core with the hooks wired into the Nodemailer provider and
    // callbacks.signIn, like POST /api/auth/signin/nodemailer (the route behind the /login
    // action). `ip` undefined sends no platform address at all.
    async function postSignIn(
      hooks: Hooks,
      email: string,
      ip: string | undefined,
      extraHeaders: Record<string, string> = {}
    ) {
      const fromNextAuth = createRequire(
        require_.resolve('next-auth/package.json')
      );
      const { Auth } = (await import(
        pathToFileURL(fromNextAuth.resolve('@auth/core')).href
      )) as {
        Auth: (r: Request, c: Record<string, unknown>) => Promise<Response>;
      };
      const posted: { request?: Request } = {};
      const config = {
        secret: 'test-secret-test-secret-test-secret',
        trustHost: true,
        basePath: '/api/auth',
        adapter: PrismaAdapter(prisma),
        session: { strategy: 'jwt' },
        pages: { verifyRequest: '/verify-request', error: '/error' },
        callbacks: {
          signIn: hooks.signInCallback(async () => posted.request!.headers),
        },
        providers: [
          Nodemailer({
            server: { host: 'localhost', port: 2525 },
            from: 'no-reply@example.test',
            normalizeIdentifier: hooks.normalizeIdentifier,
            sendVerificationRequest: hooks.sendVerificationRequest as never,
          }),
        ],
      };
      const csrfRes = await Auth(new Request(`${BASE}/api/auth/csrf`), config);
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      const cookie = csrfRes.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
      posted.request = new Request(`${BASE}/api/auth/signin/nodemailer`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie,
          ...(ip === undefined ? {} : { 'x-real-ip': ip }),
          ...extraHeaders,
        },
        body: new URLSearchParams({ email, csrfToken }),
      });
      return Auth(posted.request, config);
    }

    // Drives the real Auth.js core through the Google OIDC flow (signin -> authorization
    // redirect -> callback) with discovery, token and userinfo stubbed, the hooks wired into
    // callbacks.signIn exactly as for the email provider.
    async function googleSignIn(hooks: Hooks, email: string) {
      const fromNextAuth = createRequire(
        require_.resolve('next-auth/package.json')
      );
      const { Auth, customFetch } = (await import(
        pathToFileURL(fromNextAuth.resolve('@auth/core')).href
      )) as {
        Auth: (r: Request, c: Record<string, unknown>) => Promise<Response>;
        customFetch: symbol;
      };
      const b64 = (o: unknown) =>
        Buffer.from(JSON.stringify(o)).toString('base64url');
      const now = Math.floor(Date.now() / 1000);
      const idToken = [
        b64({ alg: 'RS256', typ: 'JWT' }),
        b64({
          iss: 'https://accounts.google.com',
          aud: 'google-client-id',
          sub: 'google-sub-1',
          email,
          email_verified: true,
          name: 'Ana',
          iat: now,
          exp: now + 3600,
        }),
        'c2ln',
      ].join('.');
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/json' },
        });
      const stubFetch = async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('.well-known/openid-configuration'))
          return json({
            issuer: 'https://accounts.google.com',
            authorization_endpoint:
              'https://accounts.google.com/o/oauth2/v2/auth',
            token_endpoint: 'https://oauth2.googleapis.com/token',
            userinfo_endpoint:
              'https://openidconnect.googleapis.com/v1/userinfo',
            jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
          });
        if (url.includes('/token'))
          return json({
            access_token: 'at',
            token_type: 'bearer',
            id_token: idToken,
          });
        if (url.includes('userinfo'))
          return json({ sub: 'google-sub-1', email, email_verified: true });
        throw new Error(`unexpected fetch ${url}`);
      };
      const first = (authConfig.providers as unknown[])[0];
      const base = (typeof first === 'function' ? first({}) : first) as Record<
        string,
        unknown
      >;
      const config = {
        secret: 'test-secret-test-secret-test-secret',
        trustHost: true,
        basePath: '/api/auth',
        adapter: PrismaAdapter(prisma),
        session: { strategy: 'jwt' },
        callbacks: {
          signIn: hooks.signInCallback(async () => new Headers()),
        },
        providers: [
          {
            ...base,
            options: {
              clientId: 'google-client-id',
              clientSecret: 'google-client-secret',
            },
            [customFetch]: stubFetch,
          },
        ],
      };
      const csrfRes = await Auth(new Request(`${BASE}/api/auth/csrf`), config);
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      const jar = new Map<string, string>();
      const absorb = (r: Response) =>
        r.headers.getSetCookie().forEach((c) => {
          const [pair] = c.split(';');
          const i = pair.indexOf('=');
          jar.set(pair.slice(0, i), pair.slice(i + 1));
        });
      const cookieHeader = () =>
        [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      absorb(csrfRes);
      const start = await Auth(
        new Request(`${BASE}/api/auth/signin/google`, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            cookie: cookieHeader(),
          },
          body: new URLSearchParams({
            csrfToken,
            callbackUrl: `${BASE}/dashboard`,
          }),
        }),
        config
      );
      absorb(start);
      const state = new URL(start.headers.get('location')!).searchParams.get(
        'state'
      );
      return Auth(
        new Request(
          `${BASE}/api/auth/callback/google?code=stub-code&state=${state}`,
          { headers: { cookie: cookieHeader() } }
        ),
        config
      );
    }

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
      vi.mocked(Sentry.captureException).mockClear();
      vi.mocked(Sentry.captureMessage).mockClear();
    });

    describe('AC-17 address rule', () => {
      const tooLong = `${'a'.repeat(250)}@example.test`;

      it.each([
        ['longer than 254 characters', tooLong],
        ['non-ASCII', 'ünal@example.test'],
      ])(
        'normalizeIdentifier refuses an address that is %s (InvalidEmailAddress)',
        (_l, email) => {
          const hooks = hooksWith(fakeTransport());
          expect(() => hooks.normalizeIdentifier(email)).toThrowError(
            expect.objectContaining({ name: 'InvalidEmailAddress' })
          );
        }
      );

      it('keeps today identity normalization (trim + lower-case) exactly', () => {
        const hooks = hooksWith(fakeTransport());
        expect(hooks.normalizeIdentifier(' User+Tag@GMail.com ')).toBe(
          'user+tag@gmail.com'
        );
      });

      it('a direct POST with an invalid address sends nothing, counts nothing, creates no token', async () => {
        const transport = fakeTransport();
        const res = await postSignIn(
          hooksWith(transport),
          'ünal@example.test',
          '198.51.100.1'
        );
        expect(res.headers.get('location')).toMatch(/\/error\?error=/);
        expect(transport.mails).toHaveLength(0);
        expect(await prisma.limitEvent.count()).toBe(0);
        expect(await prisma.verificationToken.count()).toBe(0);
      });
    });

    describe('AC-11 happy path', () => {
      // T26 / F-18: the source is counted in callbacks.signIn, so this runs the full Auth.js flow
      // (it called the send hook directly before the admission moved).
      it('sends the link and records SENT for the address and REQUESTED for the source', async () => {
        const transport = fakeTransport();
        await postSignIn(
          hooksWith(transport),
          'ana@example.test',
          '198.51.100.2'
        );
        expect(transport.mails.map((m) => m.to)).toEqual(['ana@example.test']);
        expect(
          await rows('SIGNIN_ADDRESS', addressLimitKey('ana@example.test'))
        ).toHaveLength(1);
        const source = await rows(
          'SIGNIN_SOURCE',
          sourceLimitKey('198.51.100.2')
        );
        expect(source.map((r) => r.outcome)).toEqual(['REQUESTED']);
      });

      it('through a direct POST the Visitor lands on check-your-inbox', async () => {
        const transport = fakeTransport();
        const res = await postSignIn(
          hooksWith(transport),
          'ana@example.test',
          '198.51.100.3'
        );
        expect(res.headers.get('location')).toContain(
          '/verify-request?provider=nodemailer&type=email'
        );
        expect(transport.mails).toHaveLength(1);
      });

      it('reserves and commits the SENT row before sending, outside the address lock (F-17)', async () => {
        const key = addressLimitKey('ana@example.test');
        const seen: { committedSent: number; lockFree: boolean }[] = [];
        const transport = {
          sendMail: async () => {
            const committedSent = await prisma.limitEvent.count({
              where: { scope: 'SIGNIN_ADDRESS', key, outcome: 'SENT' },
            });
            const [{ free }] = await prisma.$queryRaw<{ free: boolean }[]>`
              SELECT pg_try_advisory_lock(hashtext('SIGNIN_ADDRESS' || ':' || ${key}::text)) AS free`;
            if (free)
              await prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext('SIGNIN_ADDRESS' || ':' || ${key}::text))`;
            seen.push({ committedSent, lockFree: free });
            return {};
          },
        };
        await send(hooksWith(transport), 'ana@example.test', '198.51.100.20');
        expect(seen).toEqual([{ committedSent: 1, lockFree: true }]);
        expect(await rows('SIGNIN_ADDRESS', key)).toHaveLength(1);
      });
    });

    describe('AC-12 address limit', () => {
      it.each([
        ['letter case', 'ANA.Smith@Gmail.com'],
        ['a +tag', 'ana.smith+news@gmail.com'],
        ['gmail dots', 'a.na.smith@gmail.com'],
      ])(
        '5 sent links grouped with %s: the 6th request sends nothing, held to the floor',
        async (_l, variant) => {
          await seedSent('anasmith@gmail.com', 5);
          const transport = fakeTransport();
          const started = Date.now();
          await expect(
            send(hooksWith(transport), variant, '198.51.100.4')
          ).resolves.toBeUndefined();
          expect(transport.mails).toHaveLength(0);
          expect(Date.now() - started).toBeGreaterThanOrEqual(FLOOR_MS);
        }
      );

      it('records one REFUSED row for the address and no extra SENT row', async () => {
        await seedSent('ana@example.test', 5);
        await send(
          hooksWith(fakeTransport()),
          'ana@example.test',
          '198.51.100.5'
        );
        const all = await rows(
          'SIGNIN_ADDRESS',
          addressLimitKey('ana@example.test')
        );
        expect(all.filter((r) => r.outcome === 'SENT')).toHaveLength(5);
        expect(all.filter((r) => r.outcome === 'REFUSED')).toHaveLength(1);
      });

      it('two simultaneous requests for an address with 4 sent links send exactly one more', async () => {
        await seedSent('ana@example.test', 4);
        const transport = fakeTransport(() => 100);
        const hooks = hooksWith(transport);
        await Promise.all([
          send(hooks, 'ana@example.test', '198.51.100.14'),
          send(hooks, 'Ana+x@example.test', '198.51.100.15'),
        ]);
        expect(transport.mails).toHaveLength(1);
        const all = await rows(
          'SIGNIN_ADDRESS',
          addressLimitKey('ana@example.test')
        );
        expect(all.filter((r) => r.outcome === 'SENT')).toHaveLength(5);
      });

      it('a limited direct POST redirects to the same check-your-inbox location as a sent one', async () => {
        await seedSent('ana@example.test', 5);
        const res = await postSignIn(
          hooksWith(fakeTransport()),
          'ana@example.test',
          '198.51.100.6'
        );
        expect(res.headers.get('location')).toContain(
          '/verify-request?provider=nodemailer&type=email'
        );
      });
    });

    describe('AC-13 source limit', () => {
      // T26 / F-18: admission runs in callbacks.signIn, so the limited source is refused before
      // Auth.js writes a VerificationToken; this drives the full flow (it called the send hook
      // directly before).
      it('the 31st request from one source sends nothing, creates no token and records no refusal for the address', async () => {
        const ip = '198.51.100.7';
        for (let i = 0; i < 30; i++) {
          await createLimitEvent(prisma, {
            scope: 'SIGNIN_SOURCE',
            key: sourceLimitKey(ip),
            outcome: 'REQUESTED',
            at: new Date(Date.now() - 30_000),
          });
        }
        const transport = fakeTransport();
        const started = Date.now();
        const res = await postSignIn(
          hooksWith(transport),
          'fresh@example.test',
          ip
        );
        expect(Date.now() - started).toBeGreaterThanOrEqual(FLOOR_MS);
        expect(res.headers.get('location')).toBe(
          `${BASE}/api/auth/verify-request?provider=nodemailer&type=email`
        );
        expect(transport.mails).toHaveLength(0);
        expect(await prisma.verificationToken.count()).toBe(0);
        expect(await rows('SIGNIN_SOURCE', sourceLimitKey(ip))).toHaveLength(
          30
        );
        expect(
          await prisma.limitEvent.count({
            where: { scope: 'SIGNIN_ADDRESS', outcome: 'REFUSED' },
          })
        ).toBe(0);
      });

      it('a limited source gets the same redirect as a sent request', async () => {
        const sent = await postSignIn(
          hooksWith(fakeTransport()),
          'ana@example.test',
          '198.51.100.16'
        );
        const ip = '198.51.100.17';
        for (let i = 0; i < 30; i++) {
          await createLimitEvent(prisma, {
            scope: 'SIGNIN_SOURCE',
            key: sourceLimitKey(ip),
            outcome: 'REQUESTED',
            at: new Date(Date.now() - 30_000),
          });
        }
        const limited = await postSignIn(
          hooksWith(fakeTransport()),
          'ana@example.test',
          ip
        );
        expect(limited.status).toBe(sent.status);
        expect(limited.headers.get('location')).toBe(
          sent.headers.get('location')
        );
      });

      it('the send hook alone no longer counts the source (admission is callbacks.signIn)', async () => {
        await send(
          hooksWith(fakeTransport()),
          'ana@example.test',
          '198.51.100.18'
        );
        expect(
          await prisma.limitEvent.count({ where: { scope: 'SIGNIN_SOURCE' } })
        ).toBe(0);
      });

      it('a request with no platform address is reported, not pooled into one shared source (F-19)', async () => {
        const transport = fakeTransport();
        await postSignIn(hooksWith(transport), 'ana@example.test', undefined);
        expect(transport.mails).toHaveLength(1);
        expect(
          await prisma.limitEvent.count({ where: { scope: 'SIGNIN_SOURCE' } })
        ).toBe(0);
        expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
        const reported = JSON.stringify(
          vi.mocked(Sentry.captureMessage).mock.calls
        );
        expect(reported).not.toContain('ana@example.test');
      });

      it('ignores a client-supplied forwarding header when choosing the source', async () => {
        await postSignIn(
          hooksWith(fakeTransport()),
          'ana@example.test',
          '198.51.100.8',
          { 'x-forwarded-for': '203.0.113.99' }
        );
        expect(
          await rows('SIGNIN_SOURCE', sourceLimitKey('203.0.113.99'))
        ).toHaveLength(0);
        expect(
          await rows('SIGNIN_SOURCE', sourceLimitKey('198.51.100.8'))
        ).toHaveLength(1);
      });
    });

    describe('AC-14 other sign-in methods', () => {
      it('Google stays outside the email hooks and a limited address does not stop account lookup', async () => {
        const user = await createFreelancer(prisma, {
          email: 'ana@example.test',
        });
        await seedSent('ana@example.test', 5);
        // Providers may be factory functions; resolve them like Auth.js does before inspecting.
        const resolved = (authConfig.providers as unknown[]).map(
          (p) =>
            (typeof p === 'function' ? p({}) : p) as Record<string, unknown>
        );
        const google = resolved.find((p) => p.id === 'google');
        expect(google).toBeDefined();
        expect(google).not.toHaveProperty('sendVerificationRequest');
        const found =
          await PrismaAdapter(prisma).getUserByEmail!('ana@example.test');
        expect(found?.id).toBe(user.id);
      });

      // T27 / F-22: the structural check above cannot tell a limited address from an open one.
      // This drives the real Auth.js core through /api/auth/callback/google (discovery, token and
      // userinfo stubbed) while the address holds 5 SENT rows.
      it('Google sign-in with 5 SENT rows for the address still gets a session and writes no LimitEvent', async () => {
        await seedSent('ana@example.test', 5);
        const before = await prisma.limitEvent.count();
        const transport = fakeTransport();
        const res = await googleSignIn(
          hooksWith(transport),
          'ana@example.test'
        );
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe(`${BASE}/dashboard`);
        expect(res.headers.getSetCookie().join('\n')).toMatch(
          /authjs\.session-token=[^;]+/
        );
        expect(await prisma.limitEvent.count()).toBe(before);
        expect(transport.mails).toHaveLength(0);
        expect(
          await prisma.user.findUnique({ where: { email: 'ana@example.test' } })
        ).not.toBeNull();
      });
    });

    describe('AC-15 limit store unavailable', () => {
      it('sends nothing and raises the typed EmailSigninUnavailable error', async () => {
        const broken = {
          $transaction: async () => {
            throw new Error('connection refused');
          },
        } as unknown as PrismaClient;
        const transport = fakeTransport();
        const hooks = createEmailProviderHooks({
          prisma: broken,
          transport,
          floorMs: FLOOR_MS,
          jitterMs: JITTER_MS,
        });
        await expect(
          send(hooks, 'ana@example.test', '198.51.100.9')
        ).rejects.toMatchObject({
          name: 'EmailSigninUnavailable',
        });
        expect(transport.mails).toHaveLength(0);
        expect(await prisma.limitEvent.count()).toBe(0);
      });
    });

    describe('AC-16 TLS-only send', () => {
      it.each([
        ['no STARTTLS offered', 'Connection requires STARTTLS'],
        [
          'certificate not valid for the host',
          "Hostname/IP does not match certificate's altnames",
        ],
      ])(
        '%s: typed EmailSendFailed, reported once, no SENT row',
        async (_l, message) => {
          await expect(
            send(
              hooksWith(failingTransport(message)),
              'ana@example.test',
              '198.51.100.10'
            )
          ).rejects.toMatchObject({ name: 'EmailSendFailed' });
          expect(Sentry.captureException).toHaveBeenCalledTimes(1);
          const all = await rows(
            'SIGNIN_ADDRESS',
            addressLimitKey('ana@example.test')
          );
          expect(all.filter((r) => r.outcome === 'SENT')).toHaveLength(0);
        }
      );

      // T27 / F-23: a cause the operator can act on (TLS vs timeout vs auth) without any value
      // from the message, which can carry the address or the SMTP server's reply text.
      type Hint = { tags?: Record<string, string> };
      const reportedHint = () =>
        vi.mocked(Sentry.captureException).mock.calls[0][1] as Hint;

      it('tags the Sentry event with the value-free code, responseCode and command of the SMTP failure', async () => {
        const transport = {
          sendMail: async (): Promise<unknown> => {
            throw Object.assign(
              new Error('535 5.7.8 bad credentials for ana@example.test'),
              { code: 'EAUTH', responseCode: 535, command: 'AUTH PLAIN' }
            );
          },
        };
        await send(
          hooksWith(transport),
          'ana@example.test',
          '198.51.100.21'
        ).catch(() => undefined);
        expect(Sentry.captureException).toHaveBeenCalledTimes(1);
        expect(reportedHint().tags).toEqual({
          code: 'EAUTH',
          responseCode: '535',
          command: 'AUTH PLAIN',
        });
        const reported = JSON.stringify(
          vi.mocked(Sentry.captureException).mock.calls
        );
        expect(reported).not.toContain('ana@example.test');
        expect(reported).not.toContain('bad credentials');
      });

      it('tags a TLS host-name failure with its code and nothing from its message', async () => {
        const transport = {
          sendMail: async (): Promise<unknown> => {
            throw Object.assign(new Error('mismatch for smtp.internal.test'), {
              code: 'ERR_TLS_CERT_ALTNAME_INVALID',
            });
          },
        };
        await send(
          hooksWith(transport),
          'ana@example.test',
          '198.51.100.22'
        ).catch(() => undefined);
        expect(reportedHint().tags).toEqual({
          code: 'ERR_TLS_CERT_ALTNAME_INVALID',
        });
        expect(JSON.stringify(reportedHint())).not.toContain(
          'smtp.internal.test'
        );
      });

      it('tags a send that exceeds the time bound so it is told apart from TLS and auth failures', async () => {
        // Fake timers only around the bound: the DB work before and after runs on real ones.
        // The send hook starts the bound's timer right after calling sendMail, so the fake clock
        // goes on inside sendMail and is advanced from a microtask.
        const hanging = {
          sendMail: () => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            void Promise.resolve()
              .then(() => vi.advanceTimersByTimeAsync(10_001))
              .finally(() => vi.useRealTimers());
            return new Promise<unknown>(() => {});
          },
        };
        await send(
          hooksWith(hanging, 0),
          'ana@example.test',
          '198.51.100.24'
        ).catch(() => undefined);
        expect(reportedHint().tags).toEqual({ code: 'SEND_TIMEOUT' });
      });

      it('leaves out a code or command that is not a plain identifier', async () => {
        const transport = {
          sendMail: async (): Promise<unknown> => {
            throw Object.assign(new Error('x'), {
              code: 'ana@example.test',
              responseCode: 'oops',
              command: 'RCPT TO:<ana@example.test>',
            });
          },
        };
        await send(
          hooksWith(transport),
          'ana@example.test',
          '198.51.100.25'
        ).catch(() => undefined);
        expect(reportedHint().tags ?? {}).toEqual({});
      });

      it('never puts the raw address or source in the Sentry report', async () => {
        await send(
          hooksWith(failingTransport('boom')),
          'ana@example.test',
          '198.51.100.11'
        ).catch(() => undefined);
        const reported = JSON.stringify(
          vi.mocked(Sentry.captureException).mock.calls
        );
        expect(reported).toContain('EmailSendFailed');
        expect(reported).not.toContain('ana@example.test');
        expect(reported).not.toContain('198.51.100.11');
      });
    });

    describe('AC-03 existing account', () => {
      it('a mixed-case request for an existing address issues the link for the same User, no new row', async () => {
        const existing = await createFreelancer(prisma, {
          email: 'ana@example.test',
        });
        const transport = fakeTransport();
        await postSignIn(
          hooksWith(transport),
          'ANA@Example.test',
          '198.51.100.12'
        );
        expect(transport.mails.map((m) => m.to)).toEqual(['ana@example.test']);
        const users = await prisma.user.findMany();
        expect(users).toHaveLength(1);
        expect(users[0].id).toBe(existing.id);
      });
    });

    describe('response floor (NFR: limited vs sent medians differ by <= 150 ms)', () => {
      const median = (xs: number[]) =>
        [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

      async function timed(hooks: Hooks, email: string, ip: string) {
        const t = performance.now();
        await send(hooks, email, ip);
        return performance.now() - t;
      }

      async function batch<T>(
        n: number,
        size: number,
        fn: (i: number) => Promise<T>
      ): Promise<T[]> {
        const out: T[] = [];
        for (let i = 0; i < n; i += size) {
          out.push(
            ...(await Promise.all(
              Array.from({ length: Math.min(size, n - i) }, (_, j) => fn(i + j))
            ))
          );
        }
        return out;
      }

      it.each([
        ['instant fake SMTP', () => 0],
        [
          'random 0..F fake SMTP latency',
          () => Math.random() * TIMING_FLOOR_MS,
        ],
      ])(
        '50 limited vs 50 sent: %s',
        async (_l, latency) => {
          const hooks = hooksWith(fakeTransport(latency), TIMING_FLOOR_MS);
          for (let i = 0; i < 50; i++)
            await seedSent(`limited${i}@example.test`, 5);
          const limited = await batch(50, 10, (i) =>
            timed(hooks, `limited${i}@example.test`, `192.0.2.${i + 1}`)
          );
          const sent = await batch(50, 10, (i) =>
            timed(hooks, `sent${i}@example.test`, `192.0.3.${i + 1}`)
          );
          expect(sent.every((ms) => ms >= TIMING_FLOOR_MS - 5)).toBe(true);
          expect(limited.every((ms) => ms >= TIMING_FLOOR_MS - 5)).toBe(true);
          expect(Math.abs(median(limited) - median(sent))).toBeLessThanOrEqual(
            150
          );
        },
        120_000
      );

      it('reads F from SIGNIN_RESPONSE_FLOOR_MS when no floor is passed (F-21)', async () => {
        vi.stubEnv('SIGNIN_RESPONSE_FLOOR_MS', '300');
        try {
          const hooks = createEmailProviderHooks({
            prisma,
            transport: fakeTransport(),
            jitterMs: 0,
          });
          await seedSent('floor@example.test', 5);
          const t = Date.now();
          await send(hooks, 'floor@example.test', '198.51.100.19');
          const took = Date.now() - t;
          expect(took).toBeGreaterThanOrEqual(300);
          expect(took).toBeLessThan(900);
        } finally {
          vi.unstubAllEnvs();
        }
      });

      it('a send slower than F responds when the send finishes and still records SENT', async () => {
        const t = Date.now();
        await send(
          hooksWith(fakeTransport(() => FLOOR_MS * 3)),
          'slow@example.test',
          '198.51.100.13'
        );
        expect(Date.now() - t).toBeGreaterThanOrEqual(FLOOR_MS * 3);
        expect(
          await rows('SIGNIN_ADDRESS', addressLimitKey('slow@example.test'))
        ).toHaveLength(1);
      });
    });
  }
);
