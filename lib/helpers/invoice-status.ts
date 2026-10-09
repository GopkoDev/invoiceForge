// invoice-integrity T03 (spec.md §5 AC-04, AC-04b, AC-05, AC-06; ADR-0002) — the invoice lifecycle,
// encoded once: the transition table (data) plus the decisions every write path and the UI share.
// Pure and client-importable (no `server-only`, no Prisma client beyond the enum type): the editor and
// the list read TRANSITIONS / allowedTargets to offer only the allowed actions. `today` is the
// Freelancer's calendar date (`yyyy-MM-dd`), always passed in by the caller.

import type { InvoiceStatus } from '@prisma/client';
import { utcDateToDay, type CalendarDay } from '@/lib/helpers/calendar-day';

const STATUSES: readonly InvoiceStatus[] = ['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED'];

function isKnownStatus(value: unknown): value is InvoiceStatus {
  return STATUSES.includes(value as InvoiceStatus);
}

/**
 * The allowed moves (AC-04). OVERDUE → PENDING is listed but also needs the due date not to have
 * passed (a hand-marked overdue invoice only); allowedTargets / decideStatusChange apply that.
 */
export const TRANSITIONS: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  DRAFT: ['PENDING'],
  PENDING: ['PAID', 'OVERDUE', 'CANCELLED'],
  OVERDUE: ['PENDING', 'PAID', 'CANCELLED'],
  PAID: ['PENDING'],
  CANCELLED: [],
};

export type StatusSuggestion = 'CANCEL_AND_DUPLICATE' | 'DUPLICATE' | null;

export const STATUS_MESSAGES = {
  toDraft: 'An issued invoice can never return to draft. Cancel it and duplicate it instead.',
  cancelled: "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft.",
  pastDue:
    "This invoice is past its due date, so it can't move back to pending. Move its due date first, or mark it paid.",
  draftCancel: "A draft can't be cancelled. Delete it instead.",
  createNonDraft:
    'A new invoice always starts as a draft. Save it, then issue it by moving it to pending.',
  deleteNonDraft:
    'Only drafts can be deleted. An issued invoice can be cancelled instead; a cancelled invoice is final and stays listed.',
} as const;

function isPastDue(dueDate: Date, today: CalendarDay): boolean {
  return utcDateToDay(dueDate) < today;
}

function isAllowed(from: InvoiceStatus, to: InvoiceStatus, dueDate: Date, today: CalendarDay) {
  if (!TRANSITIONS[from].includes(to)) return false;
  return !(from === 'OVERDUE' && to === 'PENDING' && isPastDue(dueDate, today));
}

/** The statuses `status` may move to now (the list and editor offer exactly these). */
export function allowedTargets(
  status: InvoiceStatus,
  dueDate: Date,
  today: CalendarDay
): InvoiceStatus[] {
  return TRANSITIONS[status].filter((to) => isAllowed(status, to, dueDate, today));
}

export type StatusDecision =
  | { kind: 'unchanged' }
  | { kind: 'change'; status: InvoiceStatus; paidAt: Date | null }
  | { kind: 'refused'; message: string; suggestion: StatusSuggestion };

function refusal(from: InvoiceStatus, to: InvoiceStatus): StatusDecision {
  if (from === 'CANCELLED') {
    return { kind: 'refused', message: STATUS_MESSAGES.cancelled, suggestion: 'DUPLICATE' };
  }
  if (to === 'DRAFT') {
    return { kind: 'refused', message: STATUS_MESSAGES.toDraft, suggestion: 'CANCEL_AND_DUPLICATE' };
  }
  if (from === 'DRAFT' && to === 'CANCELLED') {
    return { kind: 'refused', message: STATUS_MESSAGES.draftCancel, suggestion: null };
  }
  if (from === 'OVERDUE' && to === 'PENDING') {
    return { kind: 'refused', message: STATUS_MESSAGES.pastDue, suggestion: null };
  }
  return { kind: 'refused', message: `An invoice can't move from ${from} to ${to}.`, suggestion: null };
}

/**
 * Decides a requested status against the stored row (AC-04..06). A same-status request is not a
 * change and never touches paidAt; entering PAID records `now`; leaving PAID clears paidAt.
 */
export function decideStatusChange(
  current: { status: InvoiceStatus; paidAt: Date | null; dueDate: Date },
  target: InvoiceStatus,
  ctx: { now: Date; today: CalendarDay }
): StatusDecision {
  if (!isKnownStatus(target)) {
    return { kind: 'refused', message: 'Unknown status.', suggestion: null };
  }
  if (target === current.status) return { kind: 'unchanged' };
  if (!isAllowed(current.status, target, current.dueDate, ctx.today)) {
    return refusal(current.status, target);
  }
  return { kind: 'change', status: target, paidAt: target === 'PAID' ? ctx.now : null };
}

/** A new invoice (created or duplicated) always starts as a draft (AC-04b). */
export function decideCreateStatus(
  status: InvoiceStatus
): { kind: 'ok' } | { kind: 'refused'; message: string } {
  return status === 'DRAFT'
    ? { kind: 'ok' }
    : { kind: 'refused', message: STATUS_MESSAGES.createNonDraft };
}

/** Only drafts can be deleted (AC-06); a cancelled invoice is final and stays listed. */
export function decideDelete(status: InvoiceStatus): { kind: 'ok' } | { kind: 'refused'; message: string } {
  return status === 'DRAFT' ? { kind: 'ok' } : { kind: 'refused', message: STATUS_MESSAGES.deleteNonDraft };
}
