// ai-chat-v2 revision 2026-10-13 T53 (spec §1 F5, F6; screens.md SCR-04 revision "Validation"): the per-kind format
// check of a typed Question form answer, and the composed "heading: answer" message. Isomorphic: the browser runs the
// same checks before Send, and the server runs them again (400 VALIDATION per question) before anything is counted.
import { isCalendarDay } from '@/lib/helpers/calendar-day';
import type { FormAnswer } from '@/lib/validations/assistant-chat';
import type { FormField, FormInput } from '@/types/assistant/types';

/** The SCR-04 copy, verbatim. */
export const ANSWER_MESSAGES = {
  amount: 'Enter a number greater than 0, with at most 2 decimals.',
  rate: 'Enter a rate from 0 to 100.',
  discount: 'Enter 0 or more, with at most 2 decimals.',
  day: 'Pick a real day.',
  dueBeforeIssue: "The due date can't be before the issue date.",
  blank: 'Enter an answer.',
  tooLong: (max: number) => `Keep it under ${max} characters.`,
} as const;

/** At most 8 digits before the point and 2 after (the editor's amount bounds, spec F6). */
const DECIMAL = /^\d{1,8}(\.\d{1,2})?$/;
const RATE = /^\d{1,3}(\.\d{1,2})?$/;

/** The longest typed answer per field (spec F6): a record name 200, PO 100, terms 200, notes 2,000, free 500. */
export function maxTextLength(field: FormField): number {
  switch (field) {
    case 'PO_NUMBER':
      return 100;
    case 'NOTES':
      return 2000;
    case 'FREE':
      return 500;
    default:
      return 200;
  }
}

/** Null when `text` is a well-formed answer for the question's input, else the message shown under the question. */
export function answerFormatError(question: { field: FormField; input: FormInput }, text: string): string | null {
  const value = text.trim();
  switch (question.input) {
    case 'AMOUNT':
      return DECIMAL.test(value) && Number(value) > 0 ? null : ANSWER_MESSAGES.amount;
    case 'RATE':
      return RATE.test(value) && Number(value) <= 100 ? null : ANSWER_MESSAGES.rate;
    case 'DISCOUNT':
      return DECIMAL.test(value) ? null : ANSWER_MESSAGES.discount;
    case 'DATE':
      return isCalendarDay(value) ? null : ANSWER_MESSAGES.day;
    default: {
      if (value.length === 0) return ANSWER_MESSAGES.blank;
      const max = maxTextLength(question.field);
      return value.length > max ? ANSWER_MESSAGES.tooLong(max) : null;
    }
  }
}

type CheckedQuestion = { questionId: number; field: FormField; input: FormInput };

/**
 * The format errors of a whole form, by questionId: every typed answer's own check, and a due date typed before the
 * form's issue date (typed, or a picked option whose day `optionDate` knows; the browser has no option days, the
 * server does). Picks and skips are not format-checked here; the form check refuses a pick it does not hold.
 */
export function formFormatErrors(
  questions: readonly CheckedQuestion[],
  answers: readonly FormAnswer[],
  opts: { optionDate?: (questionId: number, optionId: number) => string | null } = {}
): Record<number, string> {
  const errors: Record<number, string> = {};
  const byId = new Map(questions.map((q) => [q.questionId, q]));
  let issueDate: string | null = null;
  let due: { questionId: number; day: string } | null = null;
  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    if (!question) continue;
    if ('text' in answer) {
      const error = answerFormatError(question, answer.text);
      if (error) {
        errors[answer.questionId] = error;
        continue;
      }
      if (question.field === 'ISSUE_DATE') issueDate = answer.text.trim();
      if (question.field === 'DUE_DATE') due = { questionId: answer.questionId, day: answer.text.trim() };
    } else if ('optionId' in answer && question.field === 'ISSUE_DATE') {
      issueDate = opts.optionDate?.(answer.questionId, answer.optionId) ?? null;
    }
  }
  if (due && issueDate && due.day < issueDate) errors[due.questionId] = ANSWER_MESSAGES.dueBeforeIssue;
  return errors;
}

/**
 * The sent form's message (spec F5): one "heading: answer" line per answered question, in question order, from the
 * stored option labels and the Freelancer's own typed text (trimmed, kept on one line); a skip reads "Skipped". Never
 * text sent by the browser for the message itself.
 */
export function composeAnswerMessage(
  questions: ReadonlyArray<{ questionId: number; heading: string; options: ReadonlyArray<{ optionId: number; label: string }> }>,
  answers: readonly FormAnswer[]
): string {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  const lines: string[] = [];
  for (const question of [...questions].sort((a, b) => a.questionId - b.questionId)) {
    const answer = byQuestion.get(question.questionId);
    if (!answer) continue;
    let text: string;
    if ('optionId' in answer) {
      const option = question.options.find((o) => o.optionId === answer.optionId);
      if (!option) throw new Error('The answer names an option the question does not hold.');
      text = option.label;
    } else if ('text' in answer) {
      text = answer.text.trim().replace(/\s*\n\s*/g, ' ');
    } else {
      text = 'Skipped';
    }
    lines.push(`${question.heading}: ${text}`);
  }
  return lines.join('\n');
}
