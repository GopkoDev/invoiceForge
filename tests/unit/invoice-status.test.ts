// T11 (spec.md §5 AC-18, AC-19) — applyStatusChange, the single status/paid-date transition
// function (sad.md §8, row "Status and paid date", verbatim): entering Paid sets paidAt to now;
// saving an already-Paid invoice keeps it; leaving Paid clears it; an unknown status is rejected.
//
// docs/features/architecture-hardening/tasks/t11-invoice-rules-and-status.md, checklist:
// "Add `applyStatusChange(prev: { status; paidAt }, next: InvoiceStatus, now = new Date())` ->
// `{ status, paidAt }` - lib/helpers/invoice-status.ts". `now` is an injected instant
// (test-plan.md §Test data: "an injected clock ... for ... paidAt") so DRAFT->PAID is
// deterministic here rather than asserting against a live `new Date()`.
//
// test-plan.md rows:
//   - AC-18 "entering Paid sets the paid date and re-saving Paid keeps it" (unit)
//   - AC-19 "leaving Paid clears the paid date and an unknown status is rejected" (unit)
//
// RED (T11 not yet implemented): lib/helpers/invoice-status.ts does not exist yet, so this
// import fails to resolve.
import { describe, expect, it } from 'vitest';
import { applyStatusChange } from '@/lib/helpers/invoice-status';

const NOW = new Date('2026-03-15T12:00:00.000Z');
const EARLIER = new Date('2026-01-01T00:00:00.000Z');

describe('applyStatusChange (AC-18, AC-19)', () => {
  it('entering PAID from another status sets paidAt to now', () => {
    const result = applyStatusChange({ status: 'DRAFT', paidAt: null }, 'PAID', NOW);
    expect(result.status).toBe('PAID');
    expect(result.paidAt).toEqual(NOW);
  });

  it('re-saving an already-PAID invoice as PAID keeps the original paidAt unchanged', () => {
    const result = applyStatusChange({ status: 'PAID', paidAt: EARLIER }, 'PAID', NOW);
    expect(result.status).toBe('PAID');
    expect(result.paidAt).toEqual(EARLIER);
  });

  it('leaving PAID for PENDING clears paidAt', () => {
    const result = applyStatusChange({ status: 'PAID', paidAt: EARLIER }, 'PENDING', NOW);
    expect(result.status).toBe('PENDING');
    expect(result.paidAt).toBeNull();
  });

  it.each(['DRAFT', 'OVERDUE', 'CANCELLED'] as const)(
    'leaving PAID for %s clears paidAt',
    (next) => {
      const result = applyStatusChange({ status: 'PAID', paidAt: EARLIER }, next, NOW);
      expect(result.status).toBe(next);
      expect(result.paidAt).toBeNull();
    }
  );

  it('a non-Paid status change that stays non-Paid leaves paidAt null', () => {
    const result = applyStatusChange({ status: 'DRAFT', paidAt: null }, 'PENDING', NOW);
    expect(result.status).toBe('PENDING');
    expect(result.paidAt).toBeNull();
  });

  it('rejects an unknown status with a plain-language message', () => {
    expect(() => applyStatusChange({ status: 'DRAFT', paidAt: null }, 'FOO' as never, NOW)).toThrow(
      /unknown status/i
    );
  });
});
