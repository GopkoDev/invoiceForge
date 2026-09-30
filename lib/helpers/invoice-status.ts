// T11 (spec.md §5 AC-18, AC-19) — the single status/paid-date transition function
// (sad.md §8, row "Status and paid date", verbatim): entering Paid sets paidAt to now; saving an
// already-Paid invoice keeps it; leaving Paid clears it; an unknown status is rejected.
//
// Every save path (list status change here, T13/T14's create/update later) is meant to run
// through this one function so the paid-date rule is encoded exactly once.

import { InvoiceStatus } from '@prisma/client';

export interface InvoiceStatusSnapshot {
  status: InvoiceStatus;
  paidAt: Date | null;
}

export interface InvoiceStatusChangeResult {
  status: InvoiceStatus;
  paidAt: Date | null;
}

const KNOWN_STATUSES = new Set<string>(Object.values(InvoiceStatus));

/**
 * Applies the status/paid-date rule for a single transition:
 * - entering PAID from anything else sets paidAt to `now`
 * - re-saving an already-PAID invoice as PAID keeps its existing paidAt
 * - leaving PAID for any other status clears paidAt
 * - a status outside the known enum is rejected (never persisted)
 */
export function applyStatusChange(
  prev: InvoiceStatusSnapshot,
  next: InvoiceStatus,
  now: Date = new Date()
): InvoiceStatusChangeResult {
  if (!KNOWN_STATUSES.has(next)) {
    throw new Error('Unknown status.');
  }

  if (next !== 'PAID') {
    return { status: next, paidAt: null };
  }

  return { status: 'PAID', paidAt: prev.status === 'PAID' ? prev.paidAt : now };
}
