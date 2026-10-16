'use client';

import { useEffect, useRef, type RefObject } from 'react';

import { AllowanceNotice } from '@/components/ai/allowance-notice';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { FieldError } from '@/components/ui/field';
import type { AllowanceState } from '@/lib/validations/assistant-chat';

export const MESSAGE_MAX_LENGTH = 2000;
export const TOO_LONG_MESSAGE =
  'Messages can be at most 2,000 characters. Shorten it and send again.';

function withThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * The chat's message box (ai-chat-v2 T37 on the PromptInput element, ADR-0010): the auto-growing textarea, then the
 * footer with the too-long error and count above the counter, and the round Send. Validation, the counter and the
 * Enter rules are unchanged: Enter sends, Shift+Enter adds a line, and nothing goes out while a reply is in flight,
 * the text is empty or too long.
 */
export function Composer({
  value,
  onChange,
  onSend,
  allowance,
  busy,
  disabled = false,
  serverError,
  placeholder = 'Ask a question or describe an invoice',
  inputRef,
  autoFocus = false,
  textareaClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  allowance: AllowanceState;
  /** A reply is in flight: one message at a time. */
  busy: boolean;
  /** The Conversation is gone: nothing can be sent. */
  disabled?: boolean;
  /** A refusal from the route (400 VALIDATION), shown where the client check shows. */
  serverError?: string;
  placeholder?: string;
  /** Lets the start screen focus the box after a suggestion fills it. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  autoFocus?: boolean;
  /** The start screen's taller box (screens.md §SCR-02: the big prompt card). */
  textareaClassName?: string;
}) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const boxRef = inputRef ?? ownRef;
  const wasBusy = useRef(false);
  const trimmed = value.trim();
  const tooLong = trimmed.length > MESSAGE_MAX_LENGTH;
  const error = tooLong ? TOO_LONG_MESSAGE : serverError;
  const locked = busy || disabled;

  useEffect(() => {
    if (wasBusy.current && !busy && !disabled) boxRef.current?.focus();
    wasBusy.current = busy;
  }, [busy, disabled, boxRef]);

  function send() {
    if (locked || tooLong || !trimmed) return;
    onSend(trimmed);
  }

  return (
    <div data-slot="composer">
      <PromptInput onSubmit={send} cardClassName="min-h-[7.25rem]">
        <PromptInputBody>
          <PromptInputTextarea
            ref={boxRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={locked}
            aria-label="Message"
            aria-invalid={error ? true : undefined}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className={textareaClassName}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools className="flex-col items-start gap-1 [&_p]:text-xs">
            {error || tooLong ? (
              <div className="flex flex-wrap items-baseline gap-x-2">
                <FieldError className="text-xs">{error}</FieldError>
                {tooLong ? (
                  <span className="text-destructive text-xs">
                    {`${withThousands(trimmed.length)} / ${withThousands(MESSAGE_MAX_LENGTH)}`}
                  </span>
                ) : null}
              </div>
            ) : null}
            <AllowanceNotice state={allowance} />
          </PromptInputTools>
          <PromptInputSubmit
            status={busy ? 'submitted' : 'ready'}
            disabled={disabled || tooLong || !trimmed}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
