// T27 (spec.md §5 AC-24) — GET /api/user/export hardened: requireSession() first (before any
// data read), categories read scoped to the caller, `Session` dropped, and the file name carries
// the product name from config/site.config.ts.
//
// test-plan.md rows exercised here (integration, contract rows folded in via
// assertMatchesContract, since the response only exists once the route runs):
//   - AC-24 "no session (or a stale token for a deleted account) is refused before any category
//     is read"
//   - AC-24 "a signed-in Freelancer receives every AC-20 category except sessions, scoped to
//     their own data, named 'Invoice Forge export <UTC date>.json'"
//   - AC-24 "a Freelancer with no data yet gets 200 with empty arrays"
//   - AC-24 "a failing read returns 500 FAILED with no partial file and no internals"
//
// Seams this test assumes (RED for T27 — none of this exists in app/api/user/export/route.ts
// yet, which still calls `auth()` directly, still includes `sessions`, and hardcodes an ad hoc
// file name and exportVersion "1.0"):
//
//   1. Auth: the route calls `requireSession()` (lib/helpers/route-auth.ts, T05/T09), so this
//      test mocks '@/auth' the same way tests/integration/api/convert-image.test.ts does, to
//      drive "no session" and "stale token for a deleted account" directly.
//
//   2. DB: same-process app code (tests/README.md option 1) — `DATABASE_URL` is pointed at the
//      throwaway container before `@/prisma` is ever imported, and the *same* cached singleton
//      (globalThis-cached in prisma.ts) is imported directly in this test as `appPrisma`, so
//      spying on its model methods observes exactly the calls the route itself makes — not a
//      second, disconnected client.
//
//   3. Parallelism (A10): asserted structurally, not by timing — a failure injected into one
//      category read (customer.findMany) must still produce one clean 500 FAILED, not a partial
//      body containing any other category. Timing-based proof of `Promise.all` would be flaky in
//      CI and is intentionally not attempted here.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { createCustomer } from '../../support/factories/customer';
import { createProduct } from '../../support/factories/product';
import { createBankAccount } from '../../support/factories/bank-account';
import { createInvoice } from '../../support/factories/invoice';
import {
  assertMatchesContract,
  SECURITY_PATCH_SPEC_PATH,
} from '../../support/contract/validate';
import { createLimitEvent } from '../../support/factories/limit-event';
import { createPersonalKeyUsageWeek } from '../../support/factories/personal-key-usage-week';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

// --- Seam 1: mock '@/auth' so a test drives the session outcome directly. -------------------
const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

type GetHandler = () => Promise<Response>;

describe.runIf(containerRuntimeAvailable)(
  'GET /api/user/export (T27, AC-24)',
  () => {
    let db: TestDatabase;
    let factoryPrisma: PrismaClient;
    // The exact singleton the route uses (Seam 2) — spying here observes the route's own calls.
    let appPrisma: PrismaClient;
    let GET: GetHandler;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      factoryPrisma = createTestPrismaClient(db.connectionString);
      ({ prisma: appPrisma } = (await import('@/prisma')) as {
        prisma: PrismaClient;
      });
      ({ GET } = (await import('@/app/api/user/export/route')) as {
        GET: GetHandler;
      });
    }, 60_000);

    afterAll(async () => {
      await factoryPrisma?.$disconnect();
      await appPrisma?.$disconnect();
      await db?.stop();
    });

    beforeEach(() => {
      authMock.mockReset();
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await truncateAllTables(factoryPrisma);
    });

    /** Spies on every category read the export makes, scoped to the app's own prisma singleton. */
    function spyOnCategoryReads() {
      return {
        account: vi.spyOn(appPrisma.account, 'findMany'),
        emailHistory: vi.spyOn(appPrisma.emailHistory, 'findMany'),
        senderProfile: vi.spyOn(appPrisma.senderProfile, 'findMany'),
        customer: vi.spyOn(appPrisma.customer, 'findMany'),
        product: vi.spyOn(appPrisma.product, 'findMany'),
        invoice: vi.spyOn(appPrisma.invoice, 'findMany'),
      };
    }

    it('AC-24: refuses a Visitor with no session before any category is read', async () => {
      authMock.mockResolvedValue(null);
      const spies = spyOnCategoryReads();

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body).toEqual({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Not signed in.',
      });
      for (const spy of Object.values(spies)) {
        expect(spy).not.toHaveBeenCalled();
      }
      await assertMatchesContract({
        operationId: 'exportUserData',
        status: 401,
        body,
      });
    });

    it('AC-24: a stale token for a deleted account is refused before any category is read', async () => {
      // No User row exists for this id — requireSession() must fail closed, and the export must
      // never begin reading categories for a Visitor.
      authMock.mockResolvedValue({
        user: { id: 'deleted-account-0000000001' },
      });
      const spies = spyOnCategoryReads();

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body).toEqual({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Not signed in.',
      });
      for (const spy of Object.values(spies)) {
        expect(spy).not.toHaveBeenCalled();
      }
    });

    it('AC-24: a Freelancer with no data yet receives 200 with empty arrays', async () => {
      const freelancer = await createFreelancer(factoryPrisma);
      authMock.mockResolvedValue({ user: { id: freelancer.id } });

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        exportDate: expect.any(String),
        exportVersion: '2.1',
        user: expect.objectContaining({
          id: freelancer.id,
          email: freelancer.email,
          timeZone: null,
          overdueNoticeDismissedAt: null,
        }),
        personalKeys: [],
        accounts: [],
        emailHistory: [],
        senderProfiles: [],
        customers: [],
        products: [],
        invoices: [],
      });
      await assertMatchesContract({
        operationId: 'exportUserData',
        status: 200,
        body,
        specPath: SECURITY_PATCH_SPEC_PATH,
      });
    });

    it('AC-24: a signed-in Freelancer receives every AC-20 category except sessions, scoped to their own data, in a file named for the product', async () => {
      const owner = await createFreelancer(factoryPrisma);
      const stranger = await createFreelancer(factoryPrisma);

      const ownerProfile = await createSenderProfile(factoryPrisma, owner.id);
      await createBankAccount(factoryPrisma, ownerProfile.id);
      const ownerCustomer = await createCustomer(factoryPrisma, owner.id, {
        name: 'Owner Customer',
      });
      await createProduct(factoryPrisma, owner.id, { name: 'Owner Product' });
      const ownerBankAccount = await createBankAccount(
        factoryPrisma,
        ownerProfile.id
      );
      await createInvoice(factoryPrisma, {
        senderProfile: ownerProfile,
        customer: ownerCustomer,
        bankAccount: ownerBankAccount,
      });

      const strangerProfile = await createSenderProfile(
        factoryPrisma,
        stranger.id
      );
      const strangerCustomer = await createCustomer(
        factoryPrisma,
        stranger.id,
        {
          name: 'Stranger Customer',
        }
      );
      await createProduct(factoryPrisma, stranger.id, {
        name: 'Stranger Product',
      });
      const strangerBankAccount = await createBankAccount(
        factoryPrisma,
        strangerProfile.id
      );
      await createInvoice(factoryPrisma, {
        senderProfile: strangerProfile,
        customer: strangerCustomer,
        bankAccount: strangerBankAccount,
      });

      authMock.mockResolvedValue({ user: { id: owner.id } });
      const before = utcDateString(new Date());

      const response = await GET();
      const after = utcDateString(new Date());
      const body = await response.json();

      expect(response.status).toBe(200);
      await assertMatchesContract({
        operationId: 'exportUserData',
        status: 200,
        body,
        specPath: SECURITY_PATCH_SPEC_PATH,
      });

      // Product-named file, UTC date, per contract's Content-Disposition pattern.
      const disposition = response.headers.get('content-disposition');
      expect(disposition).toMatch(
        /^attachment; filename="Invoice Forge export \d{4}-\d{2}-\d{2}\.json"$/
      );
      const [, fileDate] = disposition!.match(/(\d{4}-\d{2}-\d{2})/)!;
      expect([before, after]).toContain(fileDate);

      // Sessions are dropped — the contract's additionalProperties:false on UserDataExport already
      // enforces this above, but assert it explicitly too since it's the AC's own wording.
      expect(body).not.toHaveProperty('sessions');
      expect(body.exportVersion).toBe('2.1');

      // Scoped to the caller only — another Freelancer's data never appears.
      const bodyText = JSON.stringify(body);
      expect(bodyText).not.toContain('Stranger Customer');
      expect(bodyText).not.toContain('Stranger Product');
      expect(bodyText).not.toContain(stranger.id);

      // The caller's own categories are all present.
      expect(bodyText).toContain('Owner Customer');
      expect(bodyText).toContain('Owner Product');
      expect(body.senderProfiles).toHaveLength(1);
      expect(body.customers).toHaveLength(1);
      expect(body.products).toHaveLength(1);
      expect(body.invoices).toHaveLength(1);

      // No OAuth tokens: accounts is empty here (no Account row created), but the shape allowed by
      // the contract only ever carries provider/type/createdAt — never access/refresh tokens.
      expect(body.accounts).toEqual([]);
    });

    it('AC-25: lists each key name, createdAt, lastUsedAt, revokedAt and usage weeks, never the key or what rebuilds it', async () => {
      const owner = await createFreelancer(factoryPrisma, {
        timeZone: 'Europe/Kyiv',
        overdueNoticeDismissedAt: new Date('2026-09-01T10:00:00Z'),
      });
      const stranger = await createFreelancer(factoryPrisma);
      const fullKey = 'ifk_' + 'a'.repeat(40);
      const digest = createHash('sha256').update(fullKey).digest('hex');
      const lastUsedAt = new Date('2026-09-20T08:00:00Z');
      const revokedAt = new Date('2026-09-25T08:00:00Z');
      const active = await factoryPrisma.personalKey.create({
        data: {
          userId: owner.id,
          name: 'Claude Desktop',
          activeNameKey: 'claude desktop',
          digest,
          lastFour: 'aaaa',
          lastUsedAt,
        },
      });
      const revoked = await factoryPrisma.personalKey.create({
        data: {
          userId: owner.id,
          name: 'Old laptop',
          digest: createHash('sha256').update('other-key').digest('hex'),
          lastFour: 'zzzz',
          revokedAt,
        },
      });
      const strangerKey = await factoryPrisma.personalKey.create({
        data: {
          userId: stranger.id,
          name: 'Stranger key',
          activeNameKey: 'stranger key',
          digest: createHash('sha256').update('stranger').digest('hex'),
          lastFour: 'qqqq',
        },
      });
      const week = new Date('2026-09-14T00:00:00Z');
      await createPersonalKeyUsageWeek(factoryPrisma, {
        personalKeyId: active.id,
        weekStart: week,
        attempts: 5,
        successes: 4,
        assistantErrors: 1,
      });
      await createPersonalKeyUsageWeek(factoryPrisma, {
        personalKeyId: strangerKey.id,
        weekStart: week,
        attempts: 99,
      });
      authMock.mockResolvedValue({ user: { id: owner.id } });

      const response = await GET();
      const text = await response.text();
      const body = JSON.parse(text);

      expect(response.status).toBe(200);
      expect(body.exportVersion).toBe('2.1');
      expect(body.user.timeZone).toBe('Europe/Kyiv');
      expect(body.user.overdueNoticeDismissedAt).toBe(
        '2026-09-01T10:00:00.000Z'
      );
      // Populated keys and usage weeks, so the item schemas (additionalProperties: false) see real rows.
      await assertMatchesContract({
        operationId: 'exportUserData',
        status: 200,
        body,
        specPath: SECURITY_PATCH_SPEC_PATH,
      });
      expect(body.personalKeys).toHaveLength(2);
      const byName = Object.fromEntries(
        body.personalKeys.map((k: { name: string }) => [k.name, k])
      );
      expect(byName['Claude Desktop']).toEqual({
        name: 'Claude Desktop',
        createdAt: active.createdAt.toISOString(),
        lastUsedAt: lastUsedAt.toISOString(),
        revokedAt: null,
        usageWeeks: [
          {
            weekStart: week.toISOString(),
            attempts: 5,
            successes: 4,
            assistantErrors: 1,
          },
        ],
      });
      expect(byName['Old laptop']).toEqual({
        name: 'Old laptop',
        createdAt: revoked.createdAt.toISOString(),
        lastUsedAt: null,
        revokedAt: revokedAt.toISOString(),
        usageWeeks: [],
      });
      for (const key of body.personalKeys) {
        for (const forbidden of ['id', 'digest', 'lastFour', 'activeNameKey']) {
          expect(key).not.toHaveProperty(forbidden);
        }
      }
      expect(text).not.toContain(fullKey);
      expect(text).not.toContain(digest);
      expect(text).not.toContain(active.id);
      expect(text).not.toContain('Stranger key');
      expect(text).not.toContain('"aaaa"');
    });

    it('AC-24: the 4th export in the hour is 429 RATE_LIMITED with retryAt and Retry-After (T13)', async () => {
      const freelancer = await createFreelancer(factoryPrisma);
      authMock.mockResolvedValue({ user: { id: freelancer.id } });
      const now = Date.now();
      const oldest = new Date(now - 30 * 60_000);
      for (const at of [
        oldest,
        new Date(now - 20 * 60_000),
        new Date(now - 10 * 60_000),
      ]) {
        await createLimitEvent(factoryPrisma, {
          scope: 'EXPORT',
          key: freelancer.id,
          userId: freelancer.id,
          outcome: 'STARTED',
          at,
        });
      }
      const spies = spyOnCategoryReads();

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(429);
      expect(body).toEqual({
        success: false,
        code: 'RATE_LIMITED',
        error: "You've reached the export limit. You can export again later.",
        details: {
          kind: 'RETRY_AT',
          retryAt: new Date(oldest.getTime() + 3_600_000).toISOString(),
        },
      });
      const retryAfter = Number(response.headers.get('retry-after'));
      expect(Number.isInteger(retryAfter)).toBe(true);
      expect(retryAfter).toBeGreaterThanOrEqual(1790);
      expect(retryAfter).toBeLessThanOrEqual(1800);
      for (const spy of Object.values(spies))
        expect(spy).not.toHaveBeenCalled();
      await assertMatchesContract({
        operationId: 'exportUserData',
        status: 429,
        body,
        specPath: SECURITY_PATCH_SPEC_PATH,
      });
    });

    it('AC-25: another Freelancer is not affected by a Freelancer at the limit (T13)', async () => {
      const limited = await createFreelancer(factoryPrisma);
      const other = await createFreelancer(factoryPrisma);
      for (let i = 0; i < 3; i++) {
        await createLimitEvent(factoryPrisma, {
          scope: 'EXPORT',
          key: limited.id,
          userId: limited.id,
          outcome: 'STARTED',
          at: new Date(),
        });
      }
      authMock.mockResolvedValue({ user: { id: other.id } });

      const response = await GET();

      expect(response.status).toBe(200);
    });

    it('AC-24: a failing category read returns 500 FAILED with nothing partial and no internals', async () => {
      const freelancer = await createFreelancer(factoryPrisma);
      authMock.mockResolvedValue({ user: { id: freelancer.id } });
      const failure = new Error(
        'connection terminated unexpectedly: pg internal detail'
      );
      vi.spyOn(appPrisma.customer, 'findMany').mockRejectedValueOnce(failure);

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toEqual({
        success: false,
        code: 'FAILED',
        error: "Your data couldn't be exported. Try again.",
      });
      expect(JSON.stringify(body)).not.toContain('pg internal detail');
      // Nothing partial: no category array leaked into the error body.
      expect(body).not.toHaveProperty('invoices');
      expect(body).not.toHaveProperty('customers');
      await assertMatchesContract({
        operationId: 'exportUserData',
        status: 500,
        body,
      });
    });
  }
);

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe.runIf(!containerRuntimeAvailable)('GET /api/user/export (T27)', () => {
  it.skip('skipped: no container runtime', () => {});
});
