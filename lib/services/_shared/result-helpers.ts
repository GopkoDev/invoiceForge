import 'server-only';
import { z } from 'zod';
import { captureException } from '@sentry/nextjs';
import { ActionFailure, fail } from '@/types/result';
import { redactError } from '@/lib/helpers/prisma-error-scrub';

/**
 * Shared classification helper (ADR-0009): turns a thrown zod validation error
 * into a coded VALIDATION failure with fieldErrors keyed by form path, so every
 * action reports the shared schema's failures the same way.
 */
export function zodValidationFailure(
  error: z.ZodError,
  message = 'Please fix the highlighted fields.',
): ActionFailure {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!fieldErrors[path]) {
      fieldErrors[path] = [];
    }
    fieldErrors[path].push(issue.message);
  }

  return fail('VALIDATION', message, { fieldErrors });
}

/**
 * True when `error` is a P2002 on the unique index `indexName`, read from explicit fields of the
 * Prisma error (invoice-integrity T29), first match wins:
 *   1. `meta.target` — the Rust query engine names the constraint here (a string, or a list).
 *   2. `meta.driverAdapterError.cause.constraint.index` — Prisma 7 driver adapters; @prisma/adapter-pg
 *      copies Postgres' constraint name into it.
 * A constraint that only lists columns (`constraint.fields`) does not identify a partial index, so it
 * never matches; neither does the name appearing anywhere else in the error.
 */
export function isUniqueHitOn(error: unknown, indexName: string): boolean {
  if (!isUniqueConstraintError(error)) return false;
  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) return false;

  const target = (meta as { target?: unknown }).target;
  if (target === indexName || (Array.isArray(target) && target.includes(indexName))) return true;

  const adapterError = (meta as { driverAdapterError?: { cause?: { constraint?: unknown } } }).driverAdapterError;
  const constraint = adapterError?.cause?.constraint;
  return typeof constraint === 'object' && constraint !== null && (constraint as { index?: unknown }).index === indexName;
}

/** True for Prisma's unique-constraint violation (P2002). */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * A FAILED result for a caught, unexpected error (ADR-0009): logs it, alerts error monitoring
 * (F-38: "the cause of a FAILED result never reaches Sentry" — before this only account-actions
 * called captureException), and returns the plain-language message the client shows. The log line
 * carries a redacted form of the error: Prisma messages embed the call arguments (U-01).
 */
export function failed(
  logContext: string,
  error: unknown,
  message: string,
  path?: string
): ActionFailure {
  console.error(logContext, redactError(error));
  // invoice-integrity T01: `path` tags the event (e.g. 'invoices.update') so generic save failures
  // can be counted per write path (spec.md §6, sad.md §7 Monitoring). Ids only, never form data.
  if (path) captureException(error, { tags: { path } });
  else captureException(error);
  return fail('FAILED', message);
}

/** True for Prisma's Restrict-FK violation (P2003) — a live "still referenced" delete conflict. */
export function isRestrictForeignKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2003'
  );
}

/**
 * T19 (AC-22, contracts/server-actions.md §deleteCustomer/deleteSenderProfile): the shared
 * "N invoices depend on this <entity>, so it can't be deleted." wording, singular for N = 1.
 */
export function hasInvoicesConflict(
  entityLabel: 'customer' | 'sender profile',
  invoiceCount: number,
): ActionFailure {
  const noun = invoiceCount === 1 ? 'invoice' : 'invoices';
  const verb = invoiceCount === 1 ? 'depends' : 'depend';
  return fail(
    'CONFLICT',
    `${invoiceCount} ${noun} ${verb} on this ${entityLabel}, so it can't be deleted.`,
    { details: { kind: 'HAS_INVOICES', invoiceCount } },
  );
}
