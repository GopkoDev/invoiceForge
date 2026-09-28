// T05 (spec.md §5 AC-01, AC-02, AC-02b, AC-03) — POST /api/convert-image rewritten to fetch only
// an owned sender profile's stored logo, never a URL from the request.
//
// test-plan.md rows exercised here (all `integration`, plus the `contract` rows folded in via
// assertMatchesContract on every response body, since the response only exists once the route
// runs — see rows AC-02b "convert-image request and response match the contract" and AC-03
// "refusal responses match the contract and carry no upstream text"):
//   - AC-01 "logo from an owned profile's secure image link is returned for the PDF"
//   - AC-02 "visitor asking for any image is refused before any fetch"
//   - AC-02b "only the logo stored on the caller's own sender profile is fetched"
//   - AC-02b "another Freelancer's sender profile is treated as not found"
//   - AC-03 "31st real fetch within a minute is refused"
//   (representative AC-03 refusal-code mappings — NOT_HTTPS, UNAVAILABLE via a private redirect —
//   are added too, since T05 owns the *mapping* of safeFetchImage's codes to HTTP status/body;
//   the exhaustive refusal-reason matrix itself is T03's tests/integration/security/safe-fetch.test.ts.)
//
// Seams this test assumes, none of which exist as production code yet (RED for T05):
//
//   1. Auth: `app/api/convert-image/route.ts` calls `requireSession()`
//      (lib/helpers/route-auth.ts, files_hint) which calls `auth()` from '@/auth' and loads the
//      `User` row, fail-closed on a missing row (task file "Scope note"). This test mocks
//      '@/auth' (`vi.mock('@/auth', ...)`) so a test controls the session outcome directly,
//      rather than minting and decoding a real next-auth JWT outside a real Next.js request
//      context (auth() reads from next/headers, which has no meaning in a bare function call).
//      The live-account check itself still runs for real, against the container database.
//
//   2. Fetching: the route must use the production singleton `safeFetchImage` from
//      '@/lib/security/safe-fetch' (task checklist: "Call safeFetchImage(profile.logo) (T03)"),
//      but tests need it to reach the local fixture image host instead of the real network. This
//      test mocks that module's `safeFetchImage` export with a spy whose implementation each test
//      sets explicitly (either delegating to a real `createSafeFetcher({ resolver, ca,
//      isPrivateAddress })` pointed at the fixture host, so real safe-fetch logic still runs end
//      to end, or a canned refusal) — mirroring the DI seam T03 already established
//      (tests/integration/security/safe-fetch.test.ts).
//
//   3. Rate limiting: `consumeLogoFetch` (lib/security/logo-rate-limit.ts, T04) is used for real,
//      unmocked — it is cheap (a couple of Postgres statements) and this suite already points
//      `@/prisma` at the throwaway container via `DATABASE_URL` + `vi.resetModules()` +
//      dynamic import (tests/README.md, "Getting app code onto the container database", option 1).
//
//   4. DB: `SenderProfile` ownership (`{ id, userId }`) is loaded from the same container
//      database via Prisma, so a foreign or missing id is provably NOT_FOUND against real data,
//      not a mock.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { startImageHost, type ImageHost } from '../../support/image-host';
import { createFakeDnsResolver } from '../../support/dns-resolver';
import { assertMatchesContract } from '../../support/contract/validate';
import { createSafeFetcher, type SafeFetchResult } from '@/lib/security/safe-fetch';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const REAL_HOSTNAME = 'logo-fixture.example.test';

// --- Seam 1: mock '@/auth' so a test drives the session outcome directly. -------------------
const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

// --- Seam 2: mock the safe-fetch module's production singleton with a spy a test wires per-case.
const safeFetchSpy = vi.fn<(url: string) => Promise<SafeFetchResult>>();
vi.mock('@/lib/security/safe-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/safe-fetch')>();
  return {
    ...actual,
    safeFetchImage: (url: string) => safeFetchSpy(url),
  };
});

type PostHandler = (request: NextRequest) => Promise<Response>;

describe.runIf(containerRuntimeAvailable)('POST /api/convert-image (T05, AC-01/AC-02/AC-02b/AC-03)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let host: ImageHost;
  let POST: PostHandler;

  beforeAll(async () => {
    db = await startTestDatabase();
    // Same-process app code (tests/README.md option 1): point the app's own `@/prisma` singleton
    // at the container before it is ever imported.
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    host = await startImageHost();
    ({ POST } = (await import('@/app/api/convert-image/route')) as { POST: PostHandler });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
    await host?.close();
  });

  beforeEach(() => {
    authMock.mockReset();
    safeFetchSpy.mockReset();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  function fixtureFetcher() {
    const resolver = createFakeDnsResolver({
      [REAL_HOSTNAME]: [{ address: '127.0.0.1', family: 4 }],
    });
    return createSafeFetcher({
      resolver,
      ca: host.ca,
      // Same escape hatch as tests/integration/security/safe-fetch.test.ts: the fixture host is
      // loopback by construction; only its own address is allow-listed, everything else still
      // goes through the real (conservative-fallback) classifier.
      isPrivateAddress: (address: string) => address !== '127.0.0.1',
    });
  }

  function urlFor(path: string): string {
    const port = new URL(host.baseUrl).port;
    return `https://${REAL_HOSTNAME}:${port}${path}`;
  }

  function postRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost:3000/api/convert-image', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify(body),
    });
  }

  it('AC-01: returns an owned https logo within the size limit as an embeddable data URL', async () => {
    const freelancer = await createFreelancer(prisma);
    const profile = await createSenderProfile(prisma, freelancer.id, { logo: urlFor('/small.png') });
    authMock.mockResolvedValue({ user: { id: freelancer.id } });
    safeFetchSpy.mockImplementation((url) => fixtureFetcher().safeFetchImage(url));

    const response = await POST(postRequest({ senderProfileId: profile.id }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
        contentType: 'image/png',
        size: expect.any(Number),
      },
    });
    await assertMatchesContract({ operationId: 'convertLogoImage', status: 200, body });
  });

  it('AC-02: refuses a Visitor with no session before any fetch, revealing nothing about any address', async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(postRequest({ senderProfileId: 'whatever0000000000000001' }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' });
    expect(safeFetchSpy).not.toHaveBeenCalled();
    await assertMatchesContract({ operationId: 'convertLogoImage', status: 401, body });
  });

  it('AC-02 fail-closed: a session token for a deleted account is treated as not signed in', async () => {
    // No User row exists for this id — requireSession() must fail closed (task file scope note).
    const staleUserId = 'deleted-account-0000000001';
    authMock.mockResolvedValue({ user: { id: staleUserId } });

    const response = await POST(postRequest({ senderProfileId: 'whatever0000000000000002' }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' });
    expect(safeFetchSpy).not.toHaveBeenCalled();

    // F-11 (T34): this "create action" (consumeLogoFetch writes/increments a LogoFetchWindow
    // row) must never run for a stale session — the guard (requireSession) has to refuse before
    // any quota row is created, not just before the fetch.
    const anyWindow = await prisma.logoFetchWindow.findFirst({ where: { userId: staleUserId } });
    expect(anyWindow).toBeNull();
  });

  it('AC-02b: treats a foreign sender profile as not found, identical to a missing one, with no fetch or quota use', async () => {
    const owner = await createFreelancer(prisma);
    const stranger = await createFreelancer(prisma);
    const profile = await createSenderProfile(prisma, owner.id, { logo: urlFor('/small.png') });
    authMock.mockResolvedValue({ user: { id: stranger.id } });

    const foreignResponse = await POST(postRequest({ senderProfileId: profile.id }));
    const foreignBody = await foreignResponse.json();
    const missingResponse = await POST(postRequest({ senderProfileId: 'does-not-exist-000000001' }));
    const missingBody = await missingResponse.json();

    expect(foreignResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);
    expect(foreignBody).toEqual(missingBody);
    expect(foreignBody).toEqual({ success: false, code: 'NOT_FOUND', error: 'Sender profile not found.' });
    expect(safeFetchSpy).not.toHaveBeenCalled();
    await assertMatchesContract({ operationId: 'convertLogoImage', status: 404, body: foreignBody });
  });

  it('AC-02b: a profile with no stored logo is not found, and nothing is fetched', async () => {
    const freelancer = await createFreelancer(prisma);
    const profile = await createSenderProfile(prisma, freelancer.id, { logo: null });
    authMock.mockResolvedValue({ user: { id: freelancer.id } });

    const response = await POST(postRequest({ senderProfileId: profile.id }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ success: false, code: 'NOT_FOUND', error: 'Sender profile not found.' });
    expect(safeFetchSpy).not.toHaveBeenCalled();
  });

  it('AC-02b: a free-form address in the request body is rejected, never fetched — only the stored link is ever used', async () => {
    const freelancer = await createFreelancer(prisma);
    const profile = await createSenderProfile(prisma, freelancer.id, { logo: urlFor('/small.png') });
    authMock.mockResolvedValue({ user: { id: freelancer.id } });

    const response = await POST(
      postRequest({ senderProfileId: profile.id, url: 'https://attacker.example.test/evil.png' })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ success: false, code: 'VALIDATION', error: 'The request is invalid.' });
    expect(safeFetchSpy).not.toHaveBeenCalled();
    await assertMatchesContract({ operationId: 'convertLogoImage', status: 400, body });
  });

  it('AC-03: a stored http:// logo link (saved before AC-04) maps to 422 NOT_HTTPS without leaking the address', async () => {
    const freelancer = await createFreelancer(prisma);
    const profile = await createSenderProfile(prisma, freelancer.id, {
      logo: 'http://insecure.example.test/logo.png',
    });
    authMock.mockResolvedValue({ user: { id: freelancer.id } });
    safeFetchSpy.mockImplementation((url) => createSafeFetcher().safeFetchImage(url));

    const response = await POST(postRequest({ senderProfileId: profile.id }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      success: false,
      code: 'NOT_HTTPS',
      error: 'The logo link is not a secure web address.',
    });
    expect(JSON.stringify(body)).not.toContain('insecure.example.test');
    await assertMatchesContract({ operationId: 'convertLogoImage', status: 422, body });

    // F-21: a refusal that never reached the fetch (NOT_HTTPS) must not spend the caller's quota -
    // no LogoFetchWindow row should exist for this Freelancer at all.
    const anyWindow = await prisma.logoFetchWindow.findFirst({ where: { userId: freelancer.id } });
    expect(anyWindow).toBeNull();
  });

  it('AC-03: a non-image response maps to 422 NOT_IMAGE, using the same refusal-message table (F-24)', async () => {
    const freelancer = await createFreelancer(prisma);
    const profile = await createSenderProfile(prisma, freelancer.id, { logo: urlFor('/html.html') });
    authMock.mockResolvedValue({ user: { id: freelancer.id } });
    safeFetchSpy.mockImplementation((url) => fixtureFetcher().safeFetchImage(url));

    const response = await POST(postRequest({ senderProfileId: profile.id }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      success: false,
      code: 'NOT_IMAGE',
      error: 'The logo file is not an image.',
    });
    await assertMatchesContract({ operationId: 'convertLogoImage', status: 422, body });
  });

  it('AC-03: an over-size response maps to 422 TOO_LARGE, using the same refusal-message table (F-24)', async () => {
    const freelancer = await createFreelancer(prisma);
    const profile = await createSenderProfile(prisma, freelancer.id, { logo: urlFor('/large-5mb.png') });
    authMock.mockResolvedValue({ user: { id: freelancer.id } });
    safeFetchSpy.mockImplementation((url) => fixtureFetcher().safeFetchImage(url));

    const response = await POST(postRequest({ senderProfileId: profile.id }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      success: false,
      code: 'TOO_LARGE',
      error: 'The logo file is larger than 512 KB.',
    });
    await assertMatchesContract({ operationId: 'convertLogoImage', status: 422, body });
  });

  it('AC-03: a redirect to a private address maps to 502 UNAVAILABLE, the same as any other unreachable link', async () => {
    const freelancer = await createFreelancer(prisma);
    const profile = await createSenderProfile(prisma, freelancer.id, { logo: urlFor('/redirect/private') });
    authMock.mockResolvedValue({ user: { id: freelancer.id } });
    safeFetchSpy.mockImplementation((url) => fixtureFetcher().safeFetchImage(url));

    const response = await POST(postRequest({ senderProfileId: profile.id }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      success: false,
      code: 'UNAVAILABLE',
      error: 'The logo could not be loaded from this link.',
    });
    expect(JSON.stringify(body)).not.toContain('169.254.169.254');
    await assertMatchesContract({ operationId: 'convertLogoImage', status: 502, body });
  });

  it(
    'AC-03: the 31st real fetch within a minute for this Freelancer is refused with 429 RATE_LIMITED and Retry-After',
    async () => {
      const freelancer = await createFreelancer(prisma);
      const profile = await createSenderProfile(prisma, freelancer.id, { logo: urlFor('/small.png') });
      authMock.mockResolvedValue({ user: { id: freelancer.id } });
      safeFetchSpy.mockImplementation((url) => fixtureFetcher().safeFetchImage(url));

      let last: Response | undefined;
      for (let i = 0; i < 31; i += 1) {
        last = await POST(postRequest({ senderProfileId: profile.id }));
      }
      const body = await last!.json();

      expect(last!.status).toBe(429);
      expect(body).toEqual({
        success: false,
        code: 'RATE_LIMITED',
        error: 'Too many requests, try again in a minute.',
      });
      const retryAfter = Number(last!.headers.get('retry-after'));
      expect(retryAfter).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBeLessThanOrEqual(60);
      await assertMatchesContract({ operationId: 'convertLogoImage', status: 429, body });
    },
    20_000
  );
});

describe.runIf(!containerRuntimeAvailable)('POST /api/convert-image (T05)', () => {
  it.skip('skipped: no container runtime', () => {});
});
