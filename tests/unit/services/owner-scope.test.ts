// T2 (spec.md §5 AC-04; sad.md §4 choice 3, ADR-0003) — the owner-scope helper maps a Prisma
// P2025 (or a count of 0) to NOT_FOUND and never turns any other error into NOT_FOUND; the result
// contract and helpers live in the shared kernel with the old paths re-exporting them.
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { fail } from '@/types/result';
import * as legacyTypes from '@/types/actions';
import * as kernelTypes from '@/types/result';
import * as legacyHelpers from '@/lib/actions/action-result-helpers';
import * as kernelHelpers from '@/lib/services/_shared/result-helpers';
import {
  isRecordNotFoundError,
  notFoundIfNoneAffected,
  notFoundOnMiss,
} from '@/lib/services/_shared/owner-scope';

const MSG = 'We could not find that record.';
const prismaError = (code: string) => Object.assign(new Error(code), { code });

describe('owner-scope (AC-04, ADR-0003)', () => {
  it('recognises P2025 only', () => {
    expect(isRecordNotFoundError(prismaError('P2025'))).toBe(true);
    expect(isRecordNotFoundError(prismaError('P2002'))).toBe(false);
    expect(isRecordNotFoundError(prismaError('P2003'))).toBe(false);
    expect(isRecordNotFoundError(new Error('boom'))).toBe(false);
    expect(isRecordNotFoundError(null)).toBe(false);
  });

  it('maps a P2025 rejection to fail(NOT_FOUND, message)', async () => {
    const result = await notFoundOnMiss(Promise.reject(prismaError('P2025')), MSG);
    expect(result).toEqual(fail('NOT_FOUND', MSG));
  });

  it('passes a successful write through untouched', async () => {
    const row = { id: 'x' };
    expect(await notFoundOnMiss(Promise.resolve(row), MSG)).toBe(row);
  });

  it.each(['P2002', 'P2003'])('rethrows %s instead of mapping it to NOT_FOUND', async (code) => {
    await expect(notFoundOnMiss(Promise.reject(prismaError(code)), MSG)).rejects.toMatchObject({
      code,
    });
  });

  it('rethrows an unknown error', async () => {
    await expect(notFoundOnMiss(Promise.reject(new Error('db down')), MSG)).rejects.toThrow(
      'db down',
    );
  });

  it('maps count === 0 to fail(NOT_FOUND, message) and leaves count > 0 alone', () => {
    expect(notFoundIfNoneAffected(0, MSG)).toEqual(fail('NOT_FOUND', MSG));
    expect(notFoundIfNoneAffected(1, MSG)).toBeNull();
    expect(notFoundIfNoneAffected(3, MSG)).toBeNull();
  });
});

describe('result kernel moves (AC-04)', () => {
  it('types/actions re-exports the same ok/fail as types/result', () => {
    expect(legacyTypes.ok).toBe(kernelTypes.ok);
    expect(legacyTypes.fail).toBe(kernelTypes.fail);
  });

  it('the old helpers path re-exports the same bindings as the shared kernel', () => {
    expect(legacyHelpers.failed).toBe(kernelHelpers.failed);
    expect(legacyHelpers.zodValidationFailure).toBe(kernelHelpers.zodValidationFailure);
    expect(legacyHelpers.hasInvoicesConflict).toBe(kernelHelpers.hasInvoicesConflict);
    expect(legacyHelpers.isUniqueConstraintError).toBe(kernelHelpers.isUniqueConstraintError);
    expect(legacyHelpers.isRestrictForeignKeyError).toBe(kernelHelpers.isRestrictForeignKeyError);
  });
});
