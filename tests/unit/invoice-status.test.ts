// The status lifecycle and paid-date rule (invoice-integrity ADR-0002, which replaced
// architecture-hardening T11's applyStatusChange): entering PAID records the moment, PAID → PENDING
// clears it, a same-status request is not a change and never touches paidAt, an unknown status is
// refused. `now` is injected so the paid date is deterministic.
import { describe, expect, it } from 'vitest';
import type { InvoiceStatus } from '@prisma/client';
import {
  TRANSITIONS,
  allowedTargets,
  decideCreateStatus,
  decideDelete,
  decideStatusChange,
} from '@/lib/helpers/invoice-status';

const NOW = new Date('2026-03-15T12:00:00.000Z');
const EARLIER = new Date('2026-01-01T00:00:00.000Z');

// invoice-integrity T03 (spec.md §5 AC-04, AC-04b, AC-05, AC-06; ADR-0002) — the lifecycle as a
// transition table plus decideStatusChange / decideCreateStatus / decideDelete. Messages and
// suggestions are contracts/server-actions.md §updateInvoiceStatus + §createInvoice + §deleteInvoice.

const STATUSES: InvoiceStatus[] = ['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED'];
const TODAY = '2026-03-15';
const DUE_FUTURE = new Date('2026-03-20T00:00:00.000Z');
const DUE_TODAY = new Date('2026-03-15T00:00:00.000Z');
const DUE_PAST = new Date('2026-03-14T00:00:00.000Z');
const CTX = { now: NOW, today: TODAY };

const MSG = {
  toDraft: 'An issued invoice can never return to draft. Cancel it and duplicate it instead.',
  cancelled: "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft.",
  pastDue:
    "This invoice is past its due date, so it can't move back to pending. Move its due date first, or mark it paid.",
  draftCancel: "A draft can't be cancelled. Delete it instead.",
  createNonDraft:
    'A new invoice always starts as a draft. Save it, then issue it by moving it to pending.',
  deleteNonDraft:
    'Only drafts can be deleted. An issued invoice can be cancelled instead; a cancelled invoice is final and stays listed.',
};

// The allowed moves of AC-04 (OVERDUE → PENDING only while not past due; covered separately).
const ALLOWED: Array<[InvoiceStatus, InvoiceStatus]> = [
  ['DRAFT', 'PENDING'],
  ['PENDING', 'PAID'],
  ['PENDING', 'OVERDUE'],
  ['PENDING', 'CANCELLED'],
  ['OVERDUE', 'PENDING'],
  ['OVERDUE', 'PAID'],
  ['OVERDUE', 'CANCELLED'],
  ['PAID', 'PENDING'],
];

function expectedRefusal(from: InvoiceStatus, to: InvoiceStatus) {
  if (from === 'CANCELLED') return { message: MSG.cancelled, suggestion: 'DUPLICATE' };
  if (to === 'DRAFT') return { message: MSG.toDraft, suggestion: 'CANCEL_AND_DUPLICATE' };
  if (from === 'DRAFT' && to === 'CANCELLED') return { message: MSG.draftCancel, suggestion: null };
  return { message: `An invoice can't move from ${from} to ${to}.`, suggestion: null };
}

const PAIRS = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const));

describe('decideStatusChange — the 25-pair matrix (AC-04, AC-05, AC-06)', () => {
  it.each(PAIRS)('%s → %s', (from, to) => {
    const paidAt = from === 'PAID' ? EARLIER : null;
    const result = decideStatusChange({ status: from, paidAt, dueDate: DUE_FUTURE }, to, CTX);

    if (from === to) {
      expect(result).toEqual({ kind: 'unchanged' });
    } else if (ALLOWED.some(([f, t]) => f === from && t === to)) {
      expect(result).toEqual({
        kind: 'change',
        status: to,
        paidAt: to === 'PAID' ? NOW : null,
      });
    } else {
      expect(result).toEqual({ kind: 'refused', ...expectedRefusal(from, to) });
    }
  });

  it('a same-status PAID request never touches paidAt', () => {
    expect(
      decideStatusChange({ status: 'PAID', paidAt: EARLIER, dueDate: DUE_PAST }, 'PAID', CTX)
    ).toEqual({ kind: 'unchanged' });
  });

  it('a derived-overdue PENDING (past due) asked for PENDING is unchanged', () => {
    expect(
      decideStatusChange({ status: 'PENDING', paidAt: null, dueDate: DUE_PAST }, 'PENDING', CTX)
    ).toEqual({ kind: 'unchanged' });
  });

  it('PAID → PENDING clears paidAt', () => {
    expect(
      decideStatusChange({ status: 'PAID', paidAt: EARLIER, dueDate: DUE_FUTURE }, 'PENDING', CTX)
    ).toEqual({ kind: 'change', status: 'PENDING', paidAt: null });
  });

  it.each([
    ['before the due date', DUE_FUTURE, true],
    ['on the due date', DUE_TODAY, true],
    ['after the due date', DUE_PAST, false],
  ] as const)('hand-marked OVERDUE → PENDING %s', (_label, dueDate, allowed) => {
    const result = decideStatusChange({ status: 'OVERDUE', paidAt: null, dueDate }, 'PENDING', CTX);
    expect(result).toEqual(
      allowed
        ? { kind: 'change', status: 'PENDING', paidAt: null }
        : { kind: 'refused', message: MSG.pastDue, suggestion: null }
    );
  });

  it('refuses an unknown status string', () => {
    const result = decideStatusChange(
      { status: 'PENDING', paidAt: null, dueDate: DUE_FUTURE },
      'FOO' as InvoiceStatus,
      CTX
    );
    expect(result.kind).toBe('refused');
  });
});

describe('TRANSITIONS / allowedTargets', () => {
  it('the table lists exactly the AC-04 moves', () => {
    const listed = STATUSES.flatMap((from) => TRANSITIONS[from].map((to) => [from, to]));
    expect(listed.sort()).toEqual([...ALLOWED].sort());
  });

  it('drops OVERDUE → PENDING once past due', () => {
    expect(allowedTargets('OVERDUE', DUE_TODAY, TODAY)).toContain('PENDING');
    expect(allowedTargets('OVERDUE', DUE_PAST, TODAY)).not.toContain('PENDING');
    expect(allowedTargets('CANCELLED', DUE_FUTURE, TODAY)).toEqual([]);
  });
});

describe('decideCreateStatus (AC-04b) and decideDelete (AC-06)', () => {
  it('accepts DRAFT on create', () => {
    expect(decideCreateStatus('DRAFT')).toEqual({ kind: 'ok' });
  });

  it.each(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'] as const)('refuses create as %s', (status) => {
    expect(decideCreateStatus(status)).toEqual({ kind: 'refused', message: MSG.createNonDraft });
  });

  it('allows deleting a draft', () => {
    expect(decideDelete('DRAFT')).toEqual({ kind: 'ok' });
  });

  it.each(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'] as const)('refuses deleting %s', (status) => {
    // contracts/server-actions.md §deleteInvoice: the refusal carries no suggestion.
    expect(decideDelete(status)).toEqual({ kind: 'refused', message: MSG.deleteNonDraft });
  });
});
