// invoice-integrity T29 (review 2026-10-08 S3; spec.md §5 AC-17; ADR-0005) — a unique hit on a partial
// default index is recognised through an explicit field of the Prisma error, never a text search of
// the serialized meta: Prisma 7 driver adapters name the index in
// meta.driverAdapterError.cause.constraint.index, the Rust engine in meta.target. Any other P2002, or a
// meta that only mentions the index in free text, is not the default CONFLICT. The real P2002 from
// Postgres is covered by the integration suites (single-default*.test.ts).
import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock('@/prisma', () => ({ prisma: {} }));

const senderProfiles = await import('@/lib/services/sender-profiles/sender-profiles');
const bankAccounts = await import('@/lib/services/bank-accounts/bank-accounts');

/** Same shape as @prisma/driver-adapter-utils' DriverAdapterError (enumerable name + cause). */
class DriverAdapterError extends Error {
  name = 'DriverAdapterError';
  cause: Record<string, unknown>;
  constructor(payload: Record<string, unknown>) {
    super(String(payload.kind));
    this.cause = payload;
  }
}

/** What Prisma 7.10 throws for a pg 23505 through @prisma/adapter-pg. */
function adapterP2002(constraint: Record<string, unknown> | undefined, table: string) {
  const driverAdapterError = new DriverAdapterError({ kind: 'UniqueConstraintViolation', constraint, table });
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { driverAdapterError, table } });
}

const cases = [
  { name: 'sender profile', mod: senderProfiles, index: 'SenderProfile_userId_isDefault_key', table: 'SenderProfile', column: 'userId' },
  { name: 'bank account', mod: bankAccounts, index: 'BankAccount_senderProfileId_isDefault_key', table: 'BankAccount', column: 'senderProfileId' },
] as const;

describe.each(cases)('isDefaultIndexConflict ($name)', ({ mod, index, table, column }) => {
  it('matches the index named by the driver adapter constraint', () => {
    expect(mod.isDefaultIndexConflict(adapterP2002({ index }, table))).toBe(true);
  });

  it('matches the index named in meta.target (string or list)', () => {
    expect(mod.isDefaultIndexConflict({ code: 'P2002', meta: { target: index } })).toBe(true);
    expect(mod.isDefaultIndexConflict({ code: 'P2002', meta: { target: [index] } })).toBe(true);
  });

  it('does not match a P2002 on another unique index', () => {
    expect(mod.isDefaultIndexConflict(adapterP2002({ index: 'User_email_key' }, 'User'))).toBe(false);
    expect(mod.isDefaultIndexConflict(adapterP2002({ index: `${table}_invoicePrefix_key` }, table))).toBe(false);
    expect(mod.isDefaultIndexConflict({ code: 'P2002', meta: { target: ['isDefault_shadow'] } })).toBe(false);
  });

  it('does not match a constraint that names only the columns (the partial index is not identified)', () => {
    expect(mod.isDefaultIndexConflict(adapterP2002({ fields: [column] }, table))).toBe(false);
  });

  it('does not search free text: the index name or "isDefault" outside the explicit fields is no match', () => {
    expect(mod.isDefaultIndexConflict({ code: 'P2002', meta: { note: 'isDefault' } })).toBe(false);
    expect(mod.isDefaultIndexConflict({ code: 'P2002', meta: { message: `violates ${index}` } })).toBe(false);
    expect(mod.isDefaultIndexConflict({ code: 'P2002', meta: { driverAdapterError: { message: index } } })).toBe(false);
  });

  it('does not match a non-unique error that names the index', () => {
    expect(mod.isDefaultIndexConflict({ code: 'P2003', meta: { target: index } })).toBe(false);
    expect(mod.isDefaultIndexConflict(new Error(index))).toBe(false);
    expect(mod.isDefaultIndexConflict(null)).toBe(false);
  });
});
