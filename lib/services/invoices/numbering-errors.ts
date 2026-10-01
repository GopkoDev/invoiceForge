// T22 (review 2026-10-01 S-05) — the error the numbering helpers throw when no sender profile
// matches the id and owner together; invoices.ts maps it to NOT_FOUND.

import 'server-only';

/**
 * Thrown when a numbering helper matches no sender profile for the given owner — the profile does
 * not exist or belongs to another Freelancer (ADR-0003).
 */
export class SenderProfileNotFoundError extends Error {
  constructor() {
    super('Sender profile not found.');
  }
}
