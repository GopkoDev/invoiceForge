'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import {
  ArrowRightIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  PencilIcon,
  XIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { dayToLocalDate, isCalendarDay, localDateToDay } from '@/lib/helpers/calendar-day';
import { cn } from '@/lib/utils';
import { answerFormatError, composeAnswerMessage, formFormatErrors } from '@/lib/validations/form-answers';
import type { FormAnswer, FormQuestionView, FormView } from '@/types/assistant/types';

/** What the Freelancer holds for one question while the form is open. Lives only in this component's state (F8). */
type Pick = { kind: 'option'; optionId: number } | { kind: 'text'; text: string } | { kind: 'skip' };

// The form chrome is English whatever language the questions are written in (owner decision 2026-10-14).
const t = {
  other: 'Something else',
  skip: 'Skip',
  previous: 'Previous question',
  next: 'Next question',
  close: 'Close questions',
  sending: 'Sending…',
  pickDate: 'Pick a date',
  counter: (n: number, total: number) => `${n} of ${total}`,
  matches: (n: number) => `${n} match. Type a more exact name.`,
};

function toAnswer(questionId: number, pick: Pick): FormAnswer {
  if (pick.kind === 'option') return { questionId, optionId: pick.optionId };
  if (pick.kind === 'text') return { questionId, text: pick.text };
  return { questionId, skipped: true };
}

const rowBase =
  'group/row flex min-h-12 w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-checked:bg-muted/60 disabled:cursor-default';
const badgeClass =
  'bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md text-xs tabular-nums';

/**
 * ai-chat-v2 T79 (AC-55, AC-56; screens.md SCR-04 "Superseded in layout 2026-10-14"): the Question form, docked above
 * the composer and asking one question at a time. Labels, headings, prompts and details are the server's, rendered as
 * plain text. A pick advances to the next unanswered question; the last answer sends the structured answers and the
 * composed text up once. Picks live in this component's state only (F8). A sent, closed or older form renders nothing.
 */
export function QuestionForm({
  form,
  isLatest,
  pending,
  onSend,
  fieldErrors,
  onClose,
}: {
  /** undefined while the labels are loading. */
  form: FormView | undefined;
  isLatest: boolean;
  pending: boolean;
  onSend: (formId: string, answers: FormAnswer[], composedText: string) => void;
  /** A server 400's field errors, keyed `form.answers.<questionId>`. */
  fieldErrors?: Record<string, string[]>;
  /** The × in the header; the island hides the dock. */
  onClose?: () => void;
}) {
  const uid = useId();
  const [cur, setCur] = useState(0);
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [otherOpen, setOtherOpen] = useState<Record<number, boolean>>({});
  const [touched, setTouched] = useState<Record<number, boolean>>({});
  const [focusAt, setFocusAt] = useState<Record<number, number>>({});
  const [seenErrors, setSeenErrors] = useState(fieldErrors);

  if (!form) return <Skeleton className="h-40 w-full rounded-xl" aria-busy="true" />;

  const questions = [...form.questions].sort((a, b) => a.questionId - b.questionId);
  const editable = form.state === 'OPEN' && (isLatest || pending);
  if (!editable || questions.length === 0) return null;

  const locked = pending;

  // A server 400's errors bring the Freelancer to the first question they name (adjusting state during render).
  if (fieldErrors !== seenErrors) {
    setSeenErrors(fieldErrors);
    const at = questions.findIndex((q) => fieldErrors?.[`form.answers.${q.questionId}`]);
    if (at >= 0) setCur(at);
  }

  const index = Math.min(cur, questions.length - 1);
  const q = questions[index];
  const qid = q.questionId;
  const pick = picks[qid];
  const hasOptions = q.options.length > 0;
  const inputOnly = !hasOptions && q.input !== 'NONE';
  const canType = q.input !== 'NONE';
  const inputOpen = canType && (inputOnly || !!otherOpen[qid] || pick?.kind === 'text');
  const draft = drafts[qid] ?? (pick?.kind === 'text' ? pick.text : '');
  const title = q.prompt ?? '';
  const titleId = `${uid}-title`;
  const errorId = `${uid}-err`;
  const inputId = `${uid}-in`;

  const heldWith = (next: Record<number, Pick>): FormAnswer[] =>
    questions.flatMap((x) => (next[x.questionId] ? [toAnswer(x.questionId, next[x.questionId])] : []));

  // The typed text is checked as it stands (with the other held answers for the due-before-issue rule).
  const typed: Record<number, Pick> = draft.trim() ? { ...picks, [qid]: { kind: 'text', text: draft } } : picks;
  const cross = formFormatErrors(questions, heldWith(typed));
  const localError = touched[qid] && canType && draft !== '' ? (answerFormatError(q, draft) ?? cross[qid] ?? null) : null;
  const error = localError ?? fieldErrors?.[`form.answers.${qid}`]?.[0] ?? null;

  const send = (next: Record<number, Pick>) => {
    const answers = heldWith(next);
    const errors = formFormatErrors(questions, answers);
    const badAt = questions.findIndex((x) => errors[x.questionId]);
    if (badAt >= 0) {
      const bad = questions[badAt];
      const badPick = next[bad.questionId];
      setPicks(next);
      if (badPick?.kind === 'text') setDrafts((prev) => ({ ...prev, [bad.questionId]: badPick.text }));
      setOtherOpen((prev) => ({ ...prev, [bad.questionId]: true }));
      setTouched((prev) => ({ ...prev, [bad.questionId]: true }));
      setCur(badAt);
      return;
    }
    onSend(form.formId, answers, composeAnswerMessage(questions, answers));
  };

  const commit = (question: FormQuestionView, value: Pick) => {
    if (locked) return;
    const next = { ...picks, [question.questionId]: value };
    setPicks(next);
    const at = questions.findIndex((x) => x.questionId === question.questionId);
    const answered = (x: FormQuestionView) => !!next[x.questionId];
    if (questions.every(answered)) return send(next);
    const later = questions.findIndex((x, i) => i > at && !answered(x));
    if (later >= 0) return setCur(later);
    if (questions.every((x) => !x.required || answered(x))) return send(next);
    setCur(questions.findIndex((x) => !answered(x)));
  };

  const commitText = (value: string) => {
    setTouched((prev) => ({ ...prev, [qid]: true }));
    const next = { ...picks, [qid]: { kind: 'text', text: value } satisfies Pick };
    if (answerFormatError(q, value) || formFormatErrors(questions, heldWith(next))[qid]) return;
    commit(q, { kind: 'text', text: value.trim() });
  };

  const choose = (optionId: number) => {
    setOtherOpen((prev) => ({ ...prev, [qid]: false }));
    commit(q, { kind: 'option', optionId });
  };

  const go = (to: number) => setCur(Math.max(0, Math.min(questions.length - 1, to)));

  const onGroupKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
    const at = radios.indexOf(document.activeElement as HTMLElement);
    if (at < 0 || radios.length === 0) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    radios[(at + step + radios.length) % radios.length].focus();
  };

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (locked || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!/^[1-9]$/.test(event.key)) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    const option = q.options[Number(event.key) - 1];
    if (!option) return;
    event.preventDefault();
    choose(option.optionId);
  };

  const decimal = q.input === 'AMOUNT' || q.input === 'RATE' || q.input === 'DISCOUNT';
  const rovingAt = focusAt[qid] ?? Math.max(0, q.options.findIndex((o) => pick?.kind === 'option' && pick.optionId === o.optionId));

  const inputRow = (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-2">
      <span className={badgeClass}>
        <PencilIcon className="size-3.5" aria-hidden />
      </span>
      <Input
        id={inputId}
        value={draft}
        autoFocus={!inputOnly}
        disabled={locked}
        inputMode={decimal ? 'decimal' : undefined}
        aria-label={inputOnly ? title : t.other}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        placeholder={t.other}
        className="h-9 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        onChange={(e) => setDrafts((prev) => ({ ...prev, [qid]: e.target.value }))}
        onBlur={() => draft !== '' && setTouched((prev) => ({ ...prev, [qid]: true }))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (draft.trim() === '') return;
            commitText(draft);
          } else if (e.key === 'Escape' && hasOptions) {
            e.stopPropagation();
            setOtherOpen((prev) => ({ ...prev, [qid]: false }));
            setDrafts((prev) => ({ ...prev, [qid]: '' }));
            setPicks((prev) => {
              const next = { ...prev };
              delete next[qid];
              return next;
            });
          }
        }}
      />
      {q.input === 'DATE' ? (
        <Popover>
          <PopoverTrigger
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t.pickDate} disabled={locked} />}
          >
            <CalendarIcon aria-hidden />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={isCalendarDay(draft.trim()) ? dayToLocalDate(draft.trim()) : undefined}
              onSelect={(date) => {
                if (!date) return;
                const day = localDateToDay(date);
                setDrafts((prev) => ({ ...prev, [qid]: day }));
                commitText(day);
              }}
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );

  const skipButton = q.skippable ? (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="shrink-0"
      disabled={locked}
      onClick={() => commit(q, { kind: 'skip' })}
    >
      {t.skip}
    </Button>
  ) : null;

  return (
    <div
      data-slot="question-form"
      data-state={form.state}
      aria-busy={pending || undefined}
      onKeyDown={onRootKeyDown}
      className="bg-card flex w-full min-w-0 flex-col gap-1 rounded-xl border p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p id={titleId} className="min-w-0 flex-1 px-1 pt-1.5 text-sm font-medium break-words">
          {title}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          {questions.length > 1 ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t.previous}
                disabled={index === 0}
                onClick={() => go(index - 1)}
              >
                <ChevronLeftIcon aria-hidden />
              </Button>
              <span className="text-muted-foreground text-xs tabular-nums">{t.counter(index + 1, questions.length)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t.next}
                disabled={index === questions.length - 1}
                onClick={() => go(index + 1)}
              >
                <ChevronRightIcon aria-hidden />
              </Button>
            </>
          ) : null}
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t.close} onClick={() => onClose?.()}>
            <XIcon aria-hidden />
          </Button>
        </div>
      </div>

      {inputOnly && q.matchCount !== null ? (
        <p className="text-muted-foreground px-1 text-xs">{t.matches(q.matchCount)}</p>
      ) : null}

      <div className="flex max-h-[50dvh] min-w-0 flex-col overflow-y-auto">
        {hasOptions ? (
          <div role="radiogroup" aria-labelledby={titleId} onKeyDown={onGroupKeyDown} className="flex flex-col">
            {q.options.map((option, i) => {
              const checked = pick?.kind === 'option' && pick.optionId === option.optionId;
              return (
                <div key={option.optionId} className="border-b py-0.5">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-disabled={locked || undefined}
                    disabled={locked}
                    tabIndex={i === rovingAt ? 0 : -1}
                    onFocus={() => setFocusAt((prev) => ({ ...prev, [qid]: i }))}
                    onClick={() => choose(option.optionId)}
                    className={rowBase}
                  >
                    <span className={badgeClass}>{i + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm break-words">{option.label}</span>
                      {option.detail ? (
                        <span className="text-muted-foreground text-xs break-words">{option.detail}</span>
                      ) : null}
                    </span>
                    <ArrowRightIcon
                      className="text-muted-foreground size-4 shrink-0 opacity-0 group-hover/row:opacity-100 group-focus-visible/row:opacity-100 group-aria-checked/row:opacity-100"
                      aria-hidden
                    />
                  </button>
                </div>
              );
            })}
            {canType || q.skippable ? (
              <div className="flex items-center gap-2 py-0.5">
                {inputOpen ? (
                  inputRow
                ) : canType ? (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={false}
                    aria-disabled={locked || undefined}
                    disabled={locked}
                    tabIndex={rovingAt === q.options.length ? 0 : -1}
                    onFocus={() => setFocusAt((prev) => ({ ...prev, [qid]: q.options.length }))}
                    onClick={() => setOtherOpen((prev) => ({ ...prev, [qid]: true }))}
                    className={cn(rowBase, 'flex-1')}
                  >
                    <span className={badgeClass}>
                      <PencilIcon className="size-3.5" aria-hidden />
                    </span>
                    <span className="text-muted-foreground min-w-0 flex-1 text-sm">{t.other}</span>
                  </button>
                ) : (
                  <span className="flex-1" />
                )}
                {skipButton}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2 py-0.5">
            {inputRow}
            {skipButton}
          </div>
        )}
        {error ? (
          <FieldError id={errorId} className="px-2 pt-1">
            {error}
          </FieldError>
        ) : null}
      </div>

      {pending ? (
        <p className="text-muted-foreground flex items-center gap-2 px-1 pt-1 text-xs">
          <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
          {t.sending}
        </p>
      ) : null}
    </div>
  );
}
