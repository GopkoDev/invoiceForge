import { z } from 'zod';
import { ActionFailure, fail } from '@/types/actions';

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

/** True for Prisma's unique-constraint violation (P2002). */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
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
