// invoice-integrity T20 (sad.md §7 Deployment view; data-model.md §Pre-release count-only report) —
// the count-only report run before the production deploy. Its counts are the baseline of the spec §7
// "new rule violations" KPI and answer spec §8 open question 1. It runs every query in one READ ONLY
// transaction and prints counts only: no ids, no names, no amounts. Nothing is repaired here; the
// release migration repairs only duplicate and missing defaults (AC-18).
//
// Run (check the host it prints first — docs/features/invoice-integrity/release.md):
//   pnpm report:invoice-integrity                                  # .env (dev)
//   node --env-file=.env.prod scripts/invoice-integrity-report.ts  # production
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export interface InvoiceIntegrityReport {
  usersWithSeveralDefaultProfiles: number;
  usersWithProfilesButNoDefault: number;
  profilesWithSeveralDefaultAccounts: number;
  profilesWithAccountsButNoDefault: number;
  accountCurrencyMismatch: { draft: number; issued: number };
  lineCurrencyMismatch: { draft: number; issued: number };
  dueBeforeIssue: number;
  impossibleStatusHistory: number;
  amountOverLimit: number;
  issuedAfterRelatedChange: number;
}

type Db = Pick<PrismaClient, '$transaction'>;
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

async function count(tx: Tx, sql: string): Promise<number> {
  const [row] = await tx.$queryRawUnsafe<{ n: bigint | number }[]>(sql);
  return Number(row?.n ?? 0);
}

async function byDraft(tx: Tx, sql: string): Promise<{ draft: number; issued: number }> {
  const rows = await tx.$queryRawUnsafe<{ draft: boolean; n: bigint | number }[]>(sql);
  const of = (draft: boolean) => Number(rows.find((r) => r.draft === draft)?.n ?? 0);
  return { draft: of(true), issued: of(false) };
}

/** The data-model.md definitions, verbatim in meaning, in one read-only transaction. */
export async function invoiceIntegrityReport(db: Db): Promise<InvoiceIntegrityReport> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return {
      usersWithSeveralDefaultProfiles: await count(
        tx,
        `SELECT count(*) AS n FROM (SELECT "userId" FROM "SenderProfile" WHERE "isDefault" GROUP BY 1 HAVING count(*) > 1) t`
      ),
      usersWithProfilesButNoDefault: await count(
        tx,
        `SELECT count(DISTINCT "userId") AS n FROM "SenderProfile" s
         WHERE NOT EXISTS (SELECT 1 FROM "SenderProfile" d WHERE d."userId" = s."userId" AND d."isDefault")`
      ),
      profilesWithSeveralDefaultAccounts: await count(
        tx,
        `SELECT count(*) AS n FROM (SELECT "senderProfileId" FROM "BankAccount" WHERE "isDefault" GROUP BY 1 HAVING count(*) > 1) t`
      ),
      profilesWithAccountsButNoDefault: await count(
        tx,
        `SELECT count(DISTINCT "senderProfileId") AS n FROM "BankAccount" a
         WHERE NOT EXISTS (SELECT 1 FROM "BankAccount" d WHERE d."senderProfileId" = a."senderProfileId" AND d."isDefault")`
      ),
      accountCurrencyMismatch: await byDraft(
        tx,
        `SELECT i."status" = 'DRAFT' AS draft, count(*) AS n FROM "Invoice" i
         JOIN "BankAccount" b ON b."id" = i."bankAccountId"
         WHERE b."currency" <> i."currency" GROUP BY 1`
      ),
      lineCurrencyMismatch: await byDraft(
        tx,
        `SELECT i."status" = 'DRAFT' AS draft, count(DISTINCT i."id") AS n FROM "Invoice" i
         JOIN "InvoiceItem" it ON it."invoiceId" = i."id"
         JOIN "Product" p ON p."id" = it."productId"
         WHERE p."currency" <> i."currency" GROUP BY 1`
      ),
      dueBeforeIssue: await count(
        tx,
        `SELECT count(*) AS n FROM "Invoice" WHERE "dueDate"::date < "issueDate"::date`
      ),
      impossibleStatusHistory: await count(
        tx,
        `SELECT count(*) AS n FROM "Invoice" WHERE ("status" = 'PAID') <> ("paidAt" IS NOT NULL)`
      ),
      // Not reachable: DECIMAL(10,2) caps every amount column at 99,999,999.99.
      amountOverLimit: 0,
      // An upper bound: updatedAt also moves on edits that don't touch printed fields (SAD §11).
      issuedAfterRelatedChange: await count(
        tx,
        `SELECT count(*) AS n FROM "Invoice" i
         JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
         JOIN "Customer" c ON c."id" = i."customerId"
         JOIN "BankAccount" b ON b."id" = i."bankAccountId"
         WHERE i."status" <> 'DRAFT'
           AND (sp."updatedAt" > i."createdAt" OR c."updatedAt" > i."createdAt" OR b."updatedAt" > i."createdAt")`
      ),
    };
  });
}

export function formatReport(r: InvoiceIntegrityReport): string {
  const split = (s: { draft: number; issued: number }) => `draft ${s.draft}, issued ${s.issued}`;
  return [
    `Freelancers with more than one default sender profile: ${r.usersWithSeveralDefaultProfiles}`,
    `Freelancers with sender profiles but no default: ${r.usersWithProfilesButNoDefault}`,
    `Sender profiles with more than one default account: ${r.profilesWithSeveralDefaultAccounts}`,
    `Sender profiles with accounts but no default: ${r.profilesWithAccountsButNoDefault}`,
    `Invoices whose currency differs from their bank account: ${split(r.accountCurrencyMismatch)}`,
    `Invoices with a catalogue line in another currency: ${split(r.lineCurrencyMismatch)}`,
    `Invoices with the due date before the issue date: ${r.dueBeforeIssue}`,
    `Invoices with an impossible status history: ${r.impossibleStatusHistory}`,
    `Invoices with an amount above 99,999,999.99: ${r.amountOverLimit}`,
    `Issued invoices saved after a related record changed (upper bound): ${r.issuedAfterRelatedChange}`,
  ].join('\n');
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  // The host only (never credentials), so the operator can confirm the target before reading on.
  console.log(`Database host: ${new URL(connectionString).host}`);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    console.log(formatReport(await invoiceIntegrityReport(prisma)));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith('invoice-integrity-report.ts')) {
  main().catch((error: unknown) => {
    console.error('The report failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
