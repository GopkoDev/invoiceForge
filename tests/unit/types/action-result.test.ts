// AC-29 (spec.md §5, verbatim): a foreign record must read exactly like a missing one - which
// only holds if there is one closed set of error codes and one shared message per entity to
// return it with (ADR-0009, Decision outcome). This file is the foundation that behaviour is
// built on: the discriminated ActionResult union and its two constructors.
//
// test-plan.md does not carry a dedicated unit row for the type itself (its own AC-29 rows are
// integration/e2e, see tests/README.md - Docker is unavailable here, so those are NOT written in
// this suite; see the handover). This is the unit-level RED the task's own checklist names:
// "Replace the type with the discriminated union + ActionErrorCode + ActionErrorDetails +
// DecimalString; add small constructors ok(data), fail(code, error, extra?)"
// (docs/features/architecture-hardening/tasks/t08-typed-action-result.md, Checklist).
//
// Contract (docs/features/architecture-hardening/contracts/server-actions.md §ActionResult):
//   type ActionErrorCode = 'UNAUTHORIZED' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FAILED';
//   type ActionResult<T = void> =
//     | { success: true; data: T }
//     | { success: false; code: ActionErrorCode; error: string;
//         fieldErrors?: Record<string, string[]>; details?: ActionErrorDetails };
//   type ActionErrorDetails =
//     | { kind: 'TOTALS_CHANGED'; oldTotal: DecimalString; newTotal: DecimalString }
//     | { kind: 'HAS_INVOICES'; invoiceCount: number };
import { describe, expect, it } from 'vitest';
import {
  ok,
  fail,
  type ActionErrorCode,
  type ActionErrorDetails,
} from '@/types/actions';

describe('ok() (types/actions.ts, ADR-0009)', () => {
  it('produces a success result carrying the data, with no code/error fields', () => {
    const result = ok({ id: 'inv_1' });

    expect(result).toEqual({ success: true, data: { id: 'inv_1' } });
    expect(result).not.toHaveProperty('code');
    expect(result).not.toHaveProperty('error');
  });
});

describe('fail() (types/actions.ts, ADR-0009)', () => {
  it('produces a NOT_FOUND result with the identical message contract requires (AC-29)', () => {
    const result = fail('NOT_FOUND', 'Invoice not found.');

    expect(result).toEqual({
      success: false,
      code: 'NOT_FOUND',
      error: 'Invoice not found.',
    });
  });

  it('attaches fieldErrors for VALIDATION/CONFLICT on forms, keyed by form path', () => {
    const result = fail('VALIDATION', 'Quantity must be greater than zero.', {
      fieldErrors: {
        'items.0.quantity': ['Quantity must be greater than zero.'],
      },
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected a failure result');
    expect(result.code).toBe('VALIDATION');
    expect(result.fieldErrors).toEqual({
      'items.0.quantity': ['Quantity must be greater than zero.'],
    });
  });

  it('attaches a typed details.kind payload for a CONFLICT (AC-22, HAS_INVOICES)', () => {
    const result = fail(
      'CONFLICT',
      "3 invoices depend on this customer, so it can't be deleted.",
      { details: { kind: 'HAS_INVOICES', invoiceCount: 3 } }
    );

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected a failure result');
    expect(result.details).toEqual({ kind: 'HAS_INVOICES', invoiceCount: 3 });
  });

  it('never carries the raw error text for a FAILED result - only a plain-language message', () => {
    // Edge case (task file): "Prisma throws inside an action -> FAILED, plain-language error;
    // the raw message only in console.error." fail() itself must not be handed the raw error
    // and echo it back - callers pass a fixed plain-language string.
    const rawPrismaMessage =
      'PrismaClientKnownRequestError: Unique constraint failed on the fields: (`userId`,`id`)';

    const result = fail('FAILED', 'Something went wrong. Please try again.');

    expect(result.error).not.toContain('Prisma');
    expect(result.error).not.toBe(rawPrismaMessage);
  });
});

describe('RATE_LIMITED result (security-patch T13, ADR-0005, AC-24)', () => {
  it('carries a typed RETRY_AT detail with an ISO UTC retryAt', () => {
    const result = fail(
      'RATE_LIMITED',
      "You've reached the export limit. You can export again later.",
      { details: { kind: 'RETRY_AT', retryAt: '2026-10-02T10:42:17.000Z' } }
    );

    expect(result).toEqual({
      success: false,
      code: 'RATE_LIMITED',
      error: "You've reached the export limit. You can export again later.",
      details: { kind: 'RETRY_AT', retryAt: '2026-10-02T10:42:17.000Z' },
    });
  });

  it('is part of the closed ActionErrorCode set (compile-time)', () => {
    const code: ActionErrorCode = 'RATE_LIMITED';
    const details: ActionErrorDetails = {
      kind: 'RETRY_AT',
      retryAt: '2026-10-02T10:42:17.000Z',
    };
    expect(code).toBe('RATE_LIMITED');
    expect(details.kind).toBe('RETRY_AT');
  });
});
