// Small uniqueness helpers shared by factories, so parallel tests never collide on fields the
// schema requires to be globally unique (e.g. SenderProfile.invoicePrefix, User.email).

import { randomUUID } from 'node:crypto';

let counter = 0;

export function uniqueSuffix(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter}${randomUUID().slice(0, 4)}`;
}

/** Fixture emails use @example.test (test-plan.md §Test data). */
export function uniqueTestEmail(label = 'user'): string {
  return `${label}-${uniqueSuffix()}@example.test`;
}

/** invoicePrefix is @unique across the whole table, so every factory call needs a fresh one. */
export function uniqueInvoicePrefix(): string {
  return `TST${uniqueSuffix()}`.toUpperCase();
}
