// T28 (spec.md §5 AC-23) — updateProfile checks the session before parsing input, per
// docs/features/architecture-hardening/tasks/t28-profile-actions-guard-first.md (Inlined
// context: contracts/server-actions.md §updateProfile, verbatim; sad.md §8 Hard rule
// "Authorization ... runs first, before any input is parsed"; sad.md §2 Conventions "Actions
// return ActionResult<T> ... and never throw to the client") and the test-plan.md row "settings
// actions without a session are refused before input is read" (integration, AC-23): for
// updateProfile, an invalid payload with no session returns not signed in, not VALIDATION, and
// nothing changes.
//
// Assumed API/result shape (task file §API contract, verbatim; types/actions.ts ActionResult):
//   updateProfile(data: ProfileFormValues): Promise<ActionResult<void>>
//     UNAUTHORIZED before any parsing -> VALIDATION (name <= 50, email format, image URL or '')
//     -> FAILED. The shape moves from { success, message } to ActionResult (no `message` field).
//
// Seams: same-process app code (tests/README.md option 1), same pattern as
// sender-profile-https-logo.test.ts: DATABASE_URL + vi.resetModules() + dynamic import, mock
// '@/auth', stub 'next/cache'. Real throwaway Postgres container.
//
// RED (T28 not yet implemented): lib/actions/profile-actions.ts today calls
// profileFormSchema.parse(data) *before* checking the session, so a malformed payload with no
// session throws a ZodError inside the try/catch and returns { success: false, error: 'Failed to
// update profile. Please try again.' } — never { code: 'UNAUTHORIZED' } — and the result has no
// `code`/`data` fields at all (still the old { success, error } shape, not ActionResult).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

// --- mock '@/auth' so a test drives the session outcome directly (same seam as
// sender-profile-https-logo.test.ts). updateProfile reads session.user.email for the
// email-changed check, so the mocked session carries both id and email. ---------------------
const authMock = vi.fn<() => Promise<{ user: { id: string; email: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

// --- next/cache's revalidatePath needs a live request/static-generation store, which this
// same-process (non-served) import never has. Stubbed out, orthogonal to what this suite tests. -
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string; fieldErrors?: Record<string, string[]> };
type ProfileFormValues = { name: string; email: string; image?: string };
type UpdateProfile = (data: ProfileFormValues) => Promise<ActionResult<void>>;

describe.runIf(containerRuntimeAvailable)('updateProfile — guard runs before parsing (T28, AC-23)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let updateProfile: UpdateProfile;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    ({ updateProfile } = (await import('@/lib/actions/profile-actions')) as unknown as {
      updateProfile: UpdateProfile;
    });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => {
    authMock.mockReset();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  it('AC-23: with no session and a malformed payload, updateProfile returns UNAUTHORIZED, not VALIDATION, and changes nothing', async () => {
    const freelancer = await createFreelancer(prisma, { email: 'guard-first@example.test' });
    authMock.mockResolvedValue(null);

    // Deliberately invalid on every field a signed-in caller would fail on too (name > 50,
    // malformed email, non-URL image) - if the session guard ran first, none of this is looked at.
    const result = await updateProfile({
      name: 'x'.repeat(51),
      email: 'not-an-email',
      image: 'not-a-url',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('UNAUTHORIZED');
    expect('message' in result).toBe(false);

    const unchanged = await prisma.user.findUnique({ where: { id: freelancer.id } });
    expect(unchanged?.name).toBe(freelancer.name);
    expect(unchanged?.email).toBe(freelancer.email);
  });

  it('AC-23: signed in with name over 50 characters returns VALIDATION with the field error, and saves nothing', async () => {
    const freelancer = await createFreelancer(prisma, { email: 'validation-owner@example.test' });
    authMock.mockResolvedValue({ user: { id: freelancer.id, email: freelancer.email } });

    const result = await updateProfile({
      name: 'x'.repeat(51),
      email: freelancer.email,
      image: '',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('VALIDATION');
    expect(result.fieldErrors?.name).toEqual(['Name must be less than 50 characters']);

    const unchanged = await prisma.user.findUnique({ where: { id: freelancer.id } });
    expect(unchanged?.name).toBe(freelancer.name);
  });

  it('AC-23: signed in with valid input, updateProfile saves the change and returns the typed ActionResult shape', async () => {
    const freelancer = await createFreelancer(prisma, { email: 'valid-owner@example.test' });
    authMock.mockResolvedValue({ user: { id: freelancer.id, email: freelancer.email } });

    const result = await updateProfile({
      name: 'Updated Name',
      email: freelancer.email,
      image: '',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect('message' in result).toBe(false);

    const saved = await prisma.user.findUnique({ where: { id: freelancer.id } });
    expect(saved?.name).toBe('Updated Name');
  });
});

describe.runIf(!containerRuntimeAvailable)('updateProfile — guard runs before parsing (T28)', () => {
  it.skip('skipped: no container runtime', () => {});
});
