/**
 * Generic action result type for server actions (ADR-0009).
 *
 * A discriminated union so pages/forms can tell "not found" from "load failed"
 * from "not signed in" at compile time. Actions never throw to the client;
 * raw database/upstream text is never returned (sad.md §8, §2).
 */

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
