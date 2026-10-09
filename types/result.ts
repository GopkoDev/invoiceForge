/**
 * Generic action result type for server actions (ADR-0009).
 *
 * A discriminated union so pages/forms can tell "not found" from "load failed"
 * from "not signed in" at compile time. Actions never throw to the client;
 * raw database/upstream text is never returned (sad.md §8, §2).
 */

import type { InvoiceStatus } from '@prisma/client';

export type ActionErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'FAILED'
  | 'RATE_LIMITED';

/** Exact 2-dp value from the shared decimal module (ADR-0006). */
export type DecimalString = string;

export type ActionErrorDetails =
  | { kind: 'TOTALS_CHANGED'; oldTotal: DecimalString; newTotal: DecimalString }
  | { kind: 'HAS_INVOICES'; invoiceCount: number }
  | { kind: 'RETRY_AT'; retryAt: string /* ISO UTC */ }
  /** A page past the last one: no rows, never an earlier page (AC-18b). */
  | { kind: 'PAGE_OUT_OF_RANGE'; total: number; lastPage: number }
  /** invoice-integrity (AC-10): the editor's loaded version is outdated; the editor opens SCR-05. */
  | { kind: 'CHANGED_ELSEWHERE'; currentVersion: number }
  /** invoice-integrity (AC-04..06, AC-04b): a lifecycle refusal; the list redraws the row at currentStatus. */
  | {
      kind: 'STATUS_NOT_ALLOWED';
      currentStatus: InvoiceStatus;
      suggestion: 'CANCEL_AND_DUPLICATE' | 'DUPLICATE' | null;
    }
  /** invoice-integrity (AC-08): a locked field changed on an issued invoice (fields in fieldErrors). */
  | { kind: 'ISSUED_INVOICE_LOCKED' }
  /** A name or number matched more than one record; the caller picks one. */
  | {
      kind: 'AMBIGUOUS_REFERENCE';
      reference: 'invoice' | 'customer' | 'senderProfile';
      candidates: AmbiguousCandidate[];
    };

export type AmbiguousCandidate = {
  id: string;
  /** Text the Freelancer typed, to be shown as data. */
  name: string;
  /** Short context that tells the candidates apart (invoice number, e-mail, ...). */
  detail?: string;
  /** Invoice candidates only (AC-20): the structured parts of `detail`. */
  senderProfile?: { senderProfileId: string; name: string };
  customer?: { customerId: string; name: string };
  issueDate?: string;
};

export type ActionFailure = {
  success: false;
  code: ActionErrorCode;
  /** Plain language, never raw DB/upstream text. */
  error: string;
  /** VALIDATION / CONFLICT on forms, keyed by form path. */
  fieldErrors?: Record<string, string[]>;
  /** Structured context for CONFLICTs the UI must tell apart. */
  details?: ActionErrorDetails;
};

export type ActionResult<T = void> = { success: true; data: T } | ActionFailure;

export function ok(): ActionResult<void>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T> {
  return { success: true, data: data as T };
}

export function fail(
  code: ActionErrorCode,
  error: string,
  extra?: {
    fieldErrors?: Record<string, string[]>;
    details?: ActionErrorDetails;
  }
): ActionFailure {
  return {
    success: false,
    code,
    error,
    ...(extra?.fieldErrors !== undefined
      ? { fieldErrors: extra.fieldErrors }
      : {}),
    ...(extra?.details !== undefined ? { details: extra.details } : {}),
  };
}
