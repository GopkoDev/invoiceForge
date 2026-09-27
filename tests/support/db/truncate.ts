// Per-test cleanup boundary (test-plan.md §Test data): truncate every app table, not a wrapping
// transaction, so the concurrency and deletion tests can see committed data from other
// connections. Call this in `beforeEach`/`afterEach` on the same client the test uses.

import type { PrismaClient } from '@prisma/client';

// Ordered so children are listed before/with parents; RESTART IDENTITY CASCADE makes FK order
// irrelevant, but keeping this readable in FK-dependency order helps when adding tables later.
const APP_TABLES = [
  'InvoiceItem',
  'Invoice',
  'CustomPrice',
  'Product',
  'Customer',
  'BankAccount',
  'SenderProfile',
  'EmailHistory',
  'VerificationToken',
  'Session',
  'Account',
  'User',
  // TODO(T01): add "LogoFetchWindow" once its migration is promoted into prisma/migrations/.
];

export async function truncateAllTables(prisma: PrismaClient): Promise<void> {
  const tableList = APP_TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}
