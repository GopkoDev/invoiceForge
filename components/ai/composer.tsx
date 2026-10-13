'use client';

import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

import { AllowanceNotice } from '@/components/ai/allowance-notice';
import { Button } from '@/components/ui/button';
import { Field, FieldError } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import type { AllowanceState } from '@/lib/validations/assistant-chat';

export const MESSAGE_MAX_LENGTH = 2000;
export const TOO_LONG_MESSAGE = 'Messages can be at most 2,000 characters. Shorten it and send again.';

function withThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

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

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div data-slot="composer" className="flex flex-col gap-2">
      <Field data-invalid={error ? true : undefined}>
        <Textarea
          ref={boxRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={locked}
          aria-label="Message"
          aria-invalid={error ? true : undefined}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
        <FieldError>{error}</FieldError>
      </Field>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AllowanceNotice state={allowance} />
          {tooLong ? (
            <span className="text-destructive text-sm">
              {`${withThousands(trimmed.length)} / ${withThousands(MESSAGE_MAX_LENGTH)}`}
            </span>
          ) : null}
        </div>
        <Button type="button" onClick={send} disabled={locked || tooLong || !trimmed}>
          Send
        </Button>
      </div>
    </div>
  );
}
