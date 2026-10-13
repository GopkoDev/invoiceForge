// ai-chat-v2 revision 2026-10-13 T53 (spec §1 F6; ADR-0011 "Submit"; sad.md §5 revision): the answers of a sent form are
// applied to the form's stored draft request by code. A picked record is pinned by its exact id, so the next resolution
// can never pick a look-alike (AC-10); an "Other…" record answer is the Freelancer's own words, matched like typed text
// (AC-38); dates and values land in their fields; a skip leaves the field unset. Pure; the input is never mutated.
import 'server-only';
import { addDaysToDay } from '@/lib/helpers/calendar-day';
import type { FormAnswer } from '@/lib/validations/assistant-chat';
import type { DraftRequest } from '@/lib/services/assistant-drafts/schema';
import type { FormOptionRef, StoredFormQuestion } from '@/lib/services/assistant-drafts/forms';

type Line = DraftRequest['lines'][number];
/** A draft request as a form may store it: the propose_draft request, or ask_user's partial draft (lines optional). */
export type DraftRequestPartial = Partial<Omit<DraftRequest, 'lines'>> & { lines?: Line[] };

type Applied = { question: StoredFormQuestion; answer: FormAnswer };

function refString(ref: FormOptionRef, key: string): string {
  const value = (ref as Record<string, unknown>)[key];
  if (typeof value !== 'string') throw new Error(`A ${key} option was expected.`);
  return value;
}

const OPTIONAL_KEYS: Partial<Record<StoredFormQuestion['field'], keyof DraftRequestPartial>> = {
  TAX_RATE: 'taxRate',
  DISCOUNT: 'discount',
  PO_NUMBER: 'poNumber',
  PAYMENT_TERMS: 'paymentTerms',
  NOTES: 'notes',
  ISSUE_DATE: 'issueDate',
  DUE_DATE: 'dueDate',
};

/**
 * The request with every draft answer applied. The issue date is applied before the due date, so "N days after the
 * issue date" counts from the issue date the draft ends up with (the pinned one, else the request's, else `today`).
 * Throws on an answer the form does not hold: `checkForm` refuses those before this runs.
 */
export function pinAnswers(
  request: DraftRequestPartial,
  questions: readonly StoredFormQuestion[],
  answers: readonly FormAnswer[],
  ctx: { today: string }
): DraftRequestPartial {
  const out: DraftRequestPartial = { ...request, ...(request.lines ? { lines: request.lines.map((l) => ({ ...l })) } : {}) };
  const applied: Applied[] = answers.map((answer) => {
    const question = questions.find((q) => q.questionId === answer.questionId);
    if (!question) throw new Error('The answer names a question the form does not hold.');
    return { question, answer };
  });
  // Dates last, issue before due.
  const order = (a: Applied) => (a.question.field === 'ISSUE_DATE' ? 1 : a.question.field === 'DUE_DATE' ? 2 : 0);
  for (const { question, answer } of [...applied].sort((a, b) => order(a) - order(b))) apply(out, question, answer, ctx);
  return out;
}

function lineAt(out: DraftRequestPartial, index: number): Line {
  const lines = (out.lines ??= []);
  while (lines.length <= index) lines.push({ description: `Line ${lines.length + 1}` });
  return lines[index];
}

function apply(out: DraftRequestPartial, question: StoredFormQuestion, answer: FormAnswer, ctx: { today: string }) {
  const { field } = question;
  if ('skipped' in answer) {
    const key = OPTIONAL_KEYS[field];
    if (key) delete out[key];
    return;
  }
  if (field === 'FREE') return; // reaches the chat through the composed message
  const option =
    'optionId' in answer
      ? (question.options.find((o) => o.optionId === answer.optionId) ??
        (() => {
          throw new Error('The answer names an option the question does not hold.');
        })())
      : null;
  const text = 'text' in answer ? answer.text.trim() : null;
  const index = question.lineIndex ?? 0;
  switch (field) {
    case 'CUSTOMER':
      if (option) {
        out.customerId = refString(option.ref, 'customerId');
        delete out.customer;
      } else {
        out.customer = text as string;
        delete out.customerId;
      }
      return;
    case 'SENDER_PROFILE':
      if (option) {
        out.senderProfileId = refString(option.ref, 'senderProfileId');
        delete out.senderProfile;
      } else {
        out.senderProfile = text as string;
        delete out.senderProfileId;
      }
      return;
    case 'BANK_ACCOUNT':
      out.bankAccount = option ? refString(option.ref, 'bankAccountId') : (text as string);
      return;
    case 'CURRENCY':
      out.currency = option ? refString(option.ref, 'currency') : (text as string);
      return;
    case 'PRODUCT': {
      const line = lineAt(out, index);
      if (option) {
        line.productId = refString(option.ref, 'productId');
      } else {
        line.description = text as string;
        delete line.productId;
      }
      return;
    }
    case 'QUANTITY':
      lineAt(out, index).quantity = text as string;
      return;
    case 'PRICE':
      lineAt(out, index).price = text as string;
      return;
    case 'ISSUE_DATE':
      out.issueDate = option ? refString(option.ref, 'date') : (text as string);
      return;
    case 'DUE_DATE': {
      if (option && 'daysAfterIssue' in option.ref) {
        out.dueDate = addDaysToDay(out.issueDate ?? ctx.today, option.ref.daysAfterIssue);
      } else {
        out.dueDate = option ? refString(option.ref, 'date') : (text as string);
      }
      return;
    }
    case 'TAX_RATE':
      out.taxRate = text as string;
      return;
    case 'DISCOUNT':
      out.discount = text as string;
      return;
    case 'PO_NUMBER':
      out.poNumber = text as string;
      return;
    case 'PAYMENT_TERMS':
      out.paymentTerms = text as string;
      return;
    case 'NOTES':
      out.notes = text as string;
      return;
  }
}
