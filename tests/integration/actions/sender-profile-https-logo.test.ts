// T20 (spec.md §5 AC-04) — createSenderProfile / updateSenderProfile refuse a non-https `logo`
// link, per docs/features/architecture-hardening/tasks/t20-sender-profile-https-logo.md
// (Inlined context: contracts/server-actions.md §updateSenderProfile / createSenderProfile,
// verbatim; sad.md §8 Hard rule "the session check runs first") and the test-plan.md row
// "saving a sender profile with an insecure logo link is blocked" (integration, AC-04):
// VALIDATION with the field error on the logo field; nothing is saved.
//
// Assumed API/result shapes (task file §API contract, verbatim; types/actions.ts ActionResult):
//   createSenderProfile(data): Promise<ActionResult<SenderProfile>>
//   updateSenderProfile(id, data): Promise<ActionResult<SenderProfile>>
//   on a non-https logo: VALIDATION, fieldErrors: { logo: ["The link must be a secure web
//     address (https://…)."] }
//
// Seams: same-process app code (tests/README.md option 1), same pattern as
// delete-blocked-by-invoices.test.ts: DATABASE_URL + vi.resetModules() + dynamic import, mock
// '@/auth', stub 'next/cache'. Real throwaway Postgres container.
//
// RED (T20 not yet implemented): senderProfileFormSchema's `logo` field is currently
// `optionalString(z.string().trim().url('Invalid URL format'))`, which accepts any well-formed
// URL including http:, so both actions currently succeed and persist an http logo instead of
// returning VALIDATION with the contract's fieldErrors.logo message.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createSenderProfile as seedSenderProfileRow } from '../../support/factories/sender-profile';

let prefixCounter = 0;
/** invoicePrefix is @unique and capped at 10 chars (invoiceFormSchema), so a short local
 * generator is used here instead of the shared uniqueInvoicePrefix() helper, which is longer
 * than the cap. */
function shortInvoicePrefix(): string {
  prefixCounter += 1;
  return `T20-${prefixCounter}`;
}

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

// --- mock '@/auth' so a test drives the session outcome directly (same seam as
// delete-blocked-by-invoices.test.ts). ------------------------------------------------------
const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

// --- next/cache's revalidatePath needs a live request/static-generation store, which this
// same-process (non-served) import never has. Stubbed out, orthogonal to what this suite tests. -
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const CONTRACT_MESSAGE = 'The link must be a secure web address (https://…).';

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string; fieldErrors?: Record<string, string[]> };
type SenderProfileFormValues = {
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  city: string;
  country: string;
  postalCode: string;
  phone: string;
  email: string;
  website: string;
  logo: string;
  invoicePrefix: string;
  isDefault: boolean;
};
type CreateSenderProfile = (
  data: SenderProfileFormValues
) => Promise<ActionResult<{ id: string; logo: string | null }>>;
type UpdateSenderProfile = (
  id: string,
  data: SenderProfileFormValues
) => Promise<ActionResult<{ id: string; logo: string | null }>>;

function formValues(overrides: Partial<SenderProfileFormValues> = {}): SenderProfileFormValues {
  return {
    name: 'Acme LLC',
    legalName: '',
    taxId: '',
    address: '',
    city: '',
    country: '',
    postalCode: '',
    phone: '',
    email: '',
    website: '',
    logo: '',
    invoicePrefix: shortInvoicePrefix(),
    isDefault: false,
    ...overrides,
  };
}

describe.runIf(containerRuntimeAvailable)('createSenderProfile / updateSenderProfile — https logo (T20, AC-04)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let createSenderProfile: CreateSenderProfile;
  let updateSenderProfile: UpdateSenderProfile;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    ({ createSenderProfile, updateSenderProfile } = (await import(
      '@/lib/actions/sender-profile-actions'
    )) as unknown as {
      createSenderProfile: CreateSenderProfile;
      updateSenderProfile: UpdateSenderProfile;
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

  it('AC-04: createSenderProfile blocks an http logo link with VALIDATION and fieldErrors.logo, and saves nothing', async () => {
    const freelancer = await createFreelancer(prisma, { email: 'create-http-logo@example.com' });
    authMock.mockResolvedValue({ user: { id: freelancer.id } });

    const result = await createSenderProfile(
      formValues({ logo: 'http://example.com/logo.png' })
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('VALIDATION');
    expect(result.fieldErrors?.logo).toEqual([CONTRACT_MESSAGE]);

    const rows = await prisma.senderProfile.findMany({ where: { userId: freelancer.id } });
    expect(rows).toHaveLength(0);
  });

  it('AC-04: createSenderProfile saves an https logo link', async () => {
    const freelancer = await createFreelancer(prisma, { email: 'create-https-logo@example.com' });
    authMock.mockResolvedValue({ user: { id: freelancer.id } });

    const result = await createSenderProfile(
      formValues({ logo: 'https://example.com/logo.png' })
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.logo).toBe('https://example.com/logo.png');
  });

  it('AC-04: updateSenderProfile blocks an http logo link with VALIDATION and fieldErrors.logo, and saves nothing', async () => {
    const freelancer = await createFreelancer(prisma, { email: 'update-http-logo@example.com' });
    const profile = await seedSenderProfileRow(prisma, freelancer.id, {
      logo: 'https://example.com/original.png',
      invoicePrefix: shortInvoicePrefix(),
    });
    authMock.mockResolvedValue({ user: { id: freelancer.id } });

    const result = await updateSenderProfile(
      profile.id,
      formValues({
        invoicePrefix: profile.invoicePrefix,
        logo: 'http://example.com/new-logo.png',
      })
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('VALIDATION');
    expect(result.fieldErrors?.logo).toEqual([CONTRACT_MESSAGE]);

    const stillOriginal = await prisma.senderProfile.findUnique({ where: { id: profile.id } });
    expect(stillOriginal?.logo).toBe('https://example.com/original.png');
  });
});

describe.runIf(!containerRuntimeAvailable)(
  'createSenderProfile / updateSenderProfile — https logo (T20)',
  () => {
    it.skip('skipped: no container runtime', () => {});
  }
);
