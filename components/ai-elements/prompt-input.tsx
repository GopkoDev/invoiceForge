/**
 * Adapted from Vercel AI Elements — https://github.com/vercel/ai-elements
 * packages/elements/src/prompt-input.tsx at commit 6a9d5b1.
 * Copyright 2023 Vercel, Inc. Licensed under the Apache License, Version 2.0 (see ./LICENSE and ./NOTICE).
 * Modified: rebuilt on @base-ui/react; see ADR-0010
 * (docs/features/ai-chat-v2/adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md).
 * Deviations: no attachments, screenshots, referenced sources, action menu, model select, hover card, command palette,
 * provider or nanoid; the caller owns the text (a controlled textarea) and its validation, so `onSubmit` receives the
 * text and the form never resets itself; the submit is a round arrow button that shows a Loader and is disabled while a
 * reply is in flight (no stop request is sent).
 */
'use client';

import { ArrowUpIcon } from 'lucide-react';
import {
  useState,
  type ComponentProps,
  type FormEvent,
  type HTMLAttributes,
  type KeyboardEvent,
} from 'react';

import { Loader } from '@/components/ai-elements/loader';
import { Button } from '@/components/ui/button';
import { InputGroupTextarea } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

/** The chat status the submit reflects (AI SDK `ChatStatus`). */
export type PromptInputStatus = 'ready' | 'submitted' | 'streaming' | 'error';

export type PromptInputProps = Omit<
  HTMLAttributes<HTMLFormElement>,
  'onSubmit'
> & {
  /** Called with the textarea's text on Enter or the submit button; the caller validates and sends. */
  onSubmit: (text: string) => void;
  /** Classes of the card inside the form. */
  cardClassName?: string;
};

/** A form holding one rounded card: the textarea, then the footer with tools and the submit. */
export function PromptInput({
  className,
  cardClassName,
  onSubmit,
  children,
  ...props
}: PromptInputProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem('message');
    const text = field instanceof HTMLTextAreaElement ? field.value : '';
    onSubmit(text);
  }
  return (
    <form
      data-slot="prompt-input"
      className={cn('w-full', className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <div
        data-slot="prompt-input-card"
        className={cn(
          'bg-background dark:bg-input/30 border-input focus-within:border-ring focus-within:ring-ring/50 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-destructive/20 flex w-full flex-col overflow-hidden rounded-2xl border shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]',
          cardClassName
        )}
      >
        {children}
      </div>
    </form>
  );
}

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputBody({ className, ...props }: PromptInputBodyProps) {
  return <div className={cn('contents', className)} {...props} />;
}

export type PromptInputTextareaProps = ComponentProps<'textarea'>;

/**
 * Auto-growing (CSS field-sizing, 1 to 8 rows by default). Enter submits the form unless the submit is disabled;
 * Shift+Enter adds a line; Enter while an IME composes text never submits.
 */
export function PromptInputTextarea({
  className,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  placeholder = 'What would you like to know?',
  ...props
}: PromptInputTextareaProps) {
  const [composing, setComposing] = useState(false);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== 'Enter') return;
    if (composing || event.nativeEvent.isComposing || event.shiftKey) return;
    event.preventDefault();
    const { form } = event.currentTarget;
    const submit = form?.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    );
    if (submit?.disabled) return;
    form?.requestSubmit();
  }

  return (
    <InputGroupTextarea
      name="message"
      placeholder={placeholder}
      className={cn(
        'field-sizing-content max-h-48 min-h-10 px-4 pt-3 pb-1 text-base md:text-sm',
        className
      )}
      onKeyDown={handleKeyDown}
      onCompositionStart={(event) => {
        setComposing(true);
        onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        setComposing(false);
        onCompositionEnd?.(event);
      }}
      {...props}
    />
  );
}

export type PromptInputFooterProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputFooter({
  className,
  ...props
}: PromptInputFooterProps) {
  return (
    <div
      data-slot="prompt-input-footer"
      className={cn(
        'flex w-full items-end justify-between gap-2 px-3 pb-2.5',
        className
      )}
      {...props}
    />
  );
}

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputTools({
  className,
  ...props
}: PromptInputToolsProps) {
  return (
    <div
      data-slot="prompt-input-tools"
      className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}
      {...props}
    />
  );
}

export type PromptInputSubmitProps = Omit<
  ComponentProps<'button'>,
  'type' | 'color'
> & {
  status?: PromptInputStatus;
};

/** The round send button: an arrow while ready or after an error; disabled with a Loader while a reply is in flight. */
export function PromptInputSubmit({
  status = 'ready',
  disabled,
  className,
  children,
  'aria-label': ariaLabel,
  ...props
}: PromptInputSubmitProps) {
  const inFlight = status === 'submitted' || status === 'streaming';
  return (
    <Button
      type="submit"
      size="icon-sm"
      aria-label={ariaLabel ?? 'Send'}
      disabled={disabled || inFlight}
      data-status={status}
      className={cn('size-8 shrink-0 rounded-full', className)}
      {...props}
    >
      {children ??
        (inFlight ? (
          <Loader className="text-current" />
        ) : (
          <ArrowUpIcon aria-hidden className="size-4" />
        ))}
    </Button>
  );
}
