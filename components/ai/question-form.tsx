'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { ArrowUpIcon, CalendarIcon, CheckIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { dayToLocalDate, isCalendarDay, localDateToDay } from '@/lib/helpers/calendar-day';
import { cn } from '@/lib/utils';
import { answerFormatError, composeAnswerMessage, formFormatErrors } from '@/lib/validations/form-answers';
import type { FormAnswer, FormQuestionView, FormView } from '@/types/assistant/types';

/** What the Freelancer holds for one question while the form is open. Lives only in this component's state (F8). */
type Pick = { kind: 'option'; optionId: number } | { kind: 'text'; text: string } | { kind: 'skip' };

const OTHER = 'other';
const SKIP = 'skip';
const TEXTAREA_FIELDS = new Set(['NOTES', 'FREE']);

function toAnswer(questionId: number, pick: Pick): FormAnswer {
  if (pick.kind === 'option') return { questionId, optionId: pick.optionId };
  if (pick.kind === 'text') return { questionId, text: pick.text };
  return { questionId, skipped: true };
}

const chipClass = 'max-w-full rounded-full px-3 data-disabled:cursor-default';

/**
 * ai-chat-v2 T59 (screens.md SCR-04 revision 2026-10-13; AC-08b, AC-12, AC-13, AC-38, AC-40): the Question form.
 * Labels, headings and prompts are the server's, rendered as plain text. Editable only while OPEN and the latest
 * reply; picks live in this component's state only. Sending hands the structured answers and the composed text up.
 */
export function QuestionForm({
  form,
  isLatest,
  pending,
  onSend,
  fieldErrors,
}: {
  /** undefined while the labels are loading. */
  form: FormView | undefined;
  isLatest: boolean;
  pending: boolean;
  onSend: (formId: string, answers: FormAnswer[], composedText: string) => void;
  /** A server 400's field errors, keyed `form.answers.<questionId>`. */
  fieldErrors?: Record<string, string[]>;
}) {
  const uid = useId();
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const [otherOpen, setOtherOpen] = useState<Record<number, boolean>>({});
  const [touched, setTouched] = useState<Record<number, boolean>>({});

  if (!form) return <Skeleton className="h-40 w-full rounded-xl" aria-busy="true" />;

  const questions = [...form.questions].sort((a, b) => a.questionId - b.questionId);
  const answered = form.state === 'CHOSEN';
  // While the sent form's request is in flight the island marks it no longer latest; it still shows as the sent form (SCR-04 sending).
  const editable = form.state === 'OPEN' && (isLatest || pending);
  const locked = pending;

  const answerOf = (questionId: number) => form.answers?.find((a) => a.questionId === questionId);

  // Format errors of what is typed so far (the due-before-issue check needs the whole set).
  const held: FormAnswer[] = questions.flatMap((q) => (picks[q.questionId] ? [toAnswer(q.questionId, picks[q.questionId])] : []));
  const formatErrors = formFormatErrors(questions, held);
  const isValid = (q: FormQuestionView) => {
    const pick = picks[q.questionId];
    if (!pick) return false;
    if (pick.kind !== 'text') return true;
    return !answerFormatError(q, pick.text) && !formatErrors[q.questionId];
  };
  const requiredCount = questions.filter((q) => q.required).length;
  // The counter is over the required questions; a form with none counts all its (optional) questions instead.
  const counted = requiredCount > 0 ? questions.filter((q) => q.required) : questions;
  const answeredCount = counted.filter(isValid).length;
  // An all-optional form needs at least one answer (or Skip) before it can be sent.
  const ready = held.length > 0 && questions.every((q) => (q.required ? isValid(q) : !picks[q.questionId] || isValid(q)));
  const sendDisabled = locked || !ready;

  const setPick = (questionId: number, pick: Pick | undefined) =>
    setPicks((prev) => {
      const next = { ...prev };
      if (pick) next[questionId] = pick;
      else delete next[questionId];
      return next;
    });
  const touch = (questionId: number) => setTouched((prev) => ({ ...prev, [questionId]: true }));

  const send = () => {
    if (sendDisabled || !editable) return;
    const answers = questions.flatMap((q) => (picks[q.questionId] ? [toAnswer(q.questionId, picks[q.questionId])] : []));
    onSend(form.formId, answers, composeAnswerMessage(questions, answers));
  };

  const errorFor = (q: FormQuestionView): string | null => {
    const pick = picks[q.questionId];
    if (pick?.kind === 'text' && touched[q.questionId]) {
      const local = answerFormatError(q, pick.text) ?? formatErrors[q.questionId] ?? null;
      if (local) return local;
    }
    return fieldErrors?.[`form.answers.${q.questionId}`]?.[0] ?? null;
  };

  return (
    <div
      data-slot="question-form"
      data-state={form.state}
      role="group"
      aria-labelledby={`${uid}-title`}
      aria-busy={pending || undefined}
      className="bg-card flex w-full flex-col gap-4 rounded-xl border p-4"
    >
      <span id={`${uid}-title`} className="sr-only">
        A few details
      </span>
      {questions.map((q) => {
        const qid = q.questionId;
        const pick = picks[qid];
        const stored = answerOf(qid);
        const hasOptions = q.options.length > 0;
        const showOther = editable && hasOptions && q.input !== 'NONE';
        const inputVisible = editable && q.input !== 'NONE' && (!hasOptions || otherOpen[qid]);
        const error = editable ? errorFor(q) : null;
        const errorId = `${uid}-err-${qid}`;
        const inputId = `${uid}-in-${qid}`;
        const headingId = `${uid}-h-${qid}`;
        const textValue = pick?.kind === 'text' ? pick.text : '';
        const interactive = editable && !locked;

        const optionChecked = (optionId: number) =>
          answered
            ? !!stored && 'optionId' in stored && stored.optionId === optionId
            : editable && pick?.kind === 'option' && pick.optionId === optionId;
        const chips: Array<{ key: string; label: string; checked: boolean; onPick: () => void; ghost?: boolean }> = [
          ...q.options.map((o) => ({
            key: `o${o.optionId}`,
            label: o.label,
            checked: optionChecked(o.optionId),
            onPick: () => {
              setOtherOpen((prev) => ({ ...prev, [qid]: false }));
              setPick(qid, { kind: 'option', optionId: o.optionId });
            },
          })),
          ...(showOther
            ? [
                {
                  key: OTHER,
                  label: 'Other…',
                  checked: !!otherOpen[qid],
                  onPick: () => {
                    setOtherOpen((prev) => ({ ...prev, [qid]: true }));
                    setPick(qid, undefined);
                    queueMicrotask(() => document.getElementById(`${uid}-in-${qid}`)?.focus());
                  },
                },
              ]
            : []),
          ...(editable && q.skippable
            ? [
                {
                  key: SKIP,
                  label: 'Skip',
                  checked: pick?.kind === 'skip',
                  ghost: true,
                  onPick: () => {
                    setOtherOpen((prev) => ({ ...prev, [qid]: false }));
                    setPick(qid, { kind: 'skip' });
                  },
                },
              ]
            : []),
        ];

        const onChipKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
          const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
          if (!keys.includes(event.key)) return;
          const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
          const at = radios.indexOf(document.activeElement as HTMLElement);
          if (at < 0 || radios.length === 0) return;
          event.preventDefault();
          const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
          radios[(at + step + radios.length) % radios.length].focus();
        };

        const onTextChange = (value: string) => setPick(qid, value === '' ? undefined : { kind: 'text', text: value });
        const inputProps = {
          id: inputId,
          value: textValue,
          disabled: locked,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': error ? errorId : undefined,
          onBlur: () => touch(qid),
          onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            if (event.key === 'Escape' && hasOptions) {
              event.stopPropagation();
              setOtherOpen((prev) => ({ ...prev, [qid]: false }));
              setPick(qid, undefined);
            }
          },
        };
        const decimal = q.input === 'AMOUNT' || q.input === 'RATE' || q.input === 'DISCOUNT';
        const suffix =
          q.input === 'RATE' ? '%' : q.field === 'PRICE' || q.input === 'DISCOUNT' ? (form.currency ?? undefined) : undefined;

        return (
          <div key={qid} data-slot="question" className="flex flex-col gap-2">
            <div id={headingId} className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {q.heading}
              {q.skippable ? ' · Optional' : ''}
            </div>
            {q.prompt ? <p className="text-sm">{q.prompt}</p> : null}
            {!hasOptions && editable && q.matchCount !== null ? (
              <p className="text-muted-foreground text-xs">{q.matchCount} match. Type a more exact name.</p>
            ) : null}

            {chips.length > 0 ? (
              <div
                role="radiogroup"
                aria-label={q.heading}
                onKeyDown={onChipKeyDown}
                className="flex flex-wrap gap-2"
              >
                {chips.map((chip) => (
                  <Button
                    key={chip.key}
                    type="button"
                    role="radio"
                    aria-checked={chip.checked}
                    size="sm"
                    variant={chip.checked ? 'secondary' : chip.ghost ? 'ghost' : 'outline'}
                    title={chip.label}
                    disabled={!interactive}
                    focusableWhenDisabled
                    className={cn(
                      chipClass,
                      chip.checked
                        ? 'border-border data-disabled:hover:bg-secondary'
                        : 'data-disabled:opacity-50 data-disabled:hover:bg-background dark:data-disabled:hover:bg-input/30'
                    )}
                    onClick={chip.onPick}
                  >
                    {chip.checked ? <CheckIcon aria-hidden /> : null}
                    <span className="truncate">{chip.label}</span>
                  </Button>
                ))}
              </div>
            ) : null}

            {inputVisible ? (
              <div className="flex items-center gap-2">
                {q.input === 'DATE' ? (
                  <Popover>
                    <PopoverTrigger
                      id={inputId}
                      aria-labelledby={`${headingId} ${inputId}`}
                      disabled={locked}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                      onBlur={() => touch(qid)}
                      className={cn(
                        'border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input aria-invalid:border-destructive inline-flex h-9 w-full items-center justify-start gap-1.5 rounded-md border px-2.5 text-left text-sm font-normal shadow-xs',
                        !textValue && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" aria-hidden />
                      {textValue || 'Pick a date'}
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={isCalendarDay(textValue) ? dayToLocalDate(textValue) : undefined}
                        onSelect={(date) => {
                          if (!date) return;
                          touch(qid);
                          onTextChange(localDateToDay(date));
                        }}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                ) : TEXTAREA_FIELDS.has(q.field) ? (
                  <Textarea
                    {...inputProps}
                    aria-labelledby={headingId}
                    rows={2}
                    onChange={(e) => onTextChange(e.target.value)}
                  />
                ) : (
                  <Input
                    {...inputProps}
                    inputMode={decimal ? 'decimal' : undefined}
                    aria-label={q.heading}
                    onChange={(e) => onTextChange(e.target.value)}
                  />
                )}
                {suffix ? <span className="text-muted-foreground text-sm">{suffix}</span> : null}
              </div>
            ) : null}
            {error ? <FieldError id={errorId}>{error}</FieldError> : null}

            {answered && stored && 'text' in stored ? (
              <p className="border-l-2 pl-2 text-sm">{stored.text}</p>
            ) : null}
            {answered && stored && 'skipped' in stored ? (
              <p className="text-muted-foreground text-sm">Skipped</p>
            ) : null}
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-2">
        {editable ? (
          <span className="text-muted-foreground text-sm">
            {`${answeredCount} of ${counted.length} answered`}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">{answered ? 'Sent' : 'Not answered'}</span>
        )}
        {editable ? (
          <Button
            type="button"
            size="sm"
            disabled={sendDisabled}
            focusableWhenDisabled
            title={ready ? undefined : 'Answer the required questions first'}
            onClick={send}
          >
            {pending ? <Spinner aria-hidden role={undefined} aria-label={undefined} /> : null}
            Send
            <ArrowUpIcon aria-hidden data-icon="inline-end" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
