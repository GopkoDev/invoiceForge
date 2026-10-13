/**
 * Adapted from Vercel AI Elements — https://github.com/vercel/ai-elements
 * packages/elements/src/message.tsx at commit 6a9d5b1.
 * Copyright 2023 Vercel, Inc. Licensed under the Apache License, Version 2.0 (see ./LICENSE and ./NOTICE).
 * Modified: rebuilt on @base-ui/react; see ADR-0010
 * (docs/features/ai-chat-v2/adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md).
 * Deviations: MessageResponse renders plain text with line breaks kept (no streamdown, no Markdown, no HTML, no links;
 * ai-assistant AC-07); Message sets `data-role`; MessageAvatar comes from the earlier upstream API; MessageAction is a
 * labelled ghost button (Base UI Tooltip via `render`, no asChild); no branch selector or toolbar.
 */
'use client';

import { SparklesIcon } from 'lucide-react';
import {
  createContext,
  useContext,
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type MessageRole = 'user' | 'assistant';

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: MessageRole;
};

const MessageRoleContext = createContext<MessageRole>('assistant');

/** One message row: a user message aligns right, an assistant message left after its avatar. */
export function Message({ className, from, ...props }: MessageProps) {
  return (
    <MessageRoleContext.Provider value={from}>
      <div
        data-slot="message"
        data-role={from}
        className={cn(
          'group flex w-full min-w-0 gap-3',
          from === 'user' ? 'is-user justify-end' : 'is-assistant items-start',
          className
        )}
        {...props}
      />
    </MessageRoleContext.Provider>
  );
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

/** The user bubble (secondary, at most 80 % of the column) or the assistant's full-width column. */
export function MessageContent({ className, ...props }: MessageContentProps) {
  const from = useContext(MessageRoleContext);
  return (
    <div
      data-slot="message-content"
      className={cn(
        'flex min-w-0 flex-col gap-2 text-sm',
        from === 'user'
          ? 'bg-secondary text-secondary-foreground max-w-[80%] rounded-2xl px-4 py-2.5'
          : 'text-foreground flex-1',
        className
      )}
      {...props}
    />
  );
}

export type MessageAvatarProps = ComponentProps<typeof Avatar> & {
  src?: string;
  name?: string;
  /** Shown when there is no image; defaults to the assistant's sparkles mark. */
  fallback?: ReactNode;
};

/** The 24 px avatar beside an assistant message (upstream's earlier MessageAvatar API). Decorative. */
export function MessageAvatar({
  src,
  name,
  fallback,
  className,
  ...props
}: MessageAvatarProps) {
  return (
    <Avatar
      data-slot="message-avatar"
      size="sm"
      aria-hidden
      className={cn('mt-0.5', className)}
      {...props}
    >
      {src ? <AvatarImage src={src} alt={name ?? ''} /> : null}
      <AvatarFallback className="bg-primary text-primary-foreground">
        {fallback ?? <SparklesIcon className="size-3.5" />}
      </AvatarFallback>
    </Avatar>
  );
}

export type MessageResponseProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'children'
> & {
  children: string;
};

/**
 * A reply's text, always plain: line breaks kept, never Markdown, HTML or a link (ai-assistant AC-07, ADR-0010).
 * Links come only from structured parts, rendered beside it by the caller.
 */
export function MessageResponse({
  className,
  children,
  ...props
}: MessageResponseProps) {
  return (
    <div
      data-slot="message-response"
      className={cn('break-words whitespace-pre-wrap', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export type MessageActionsProps = ComponentProps<'div'>;

export function MessageActions({ className, ...props }: MessageActionsProps) {
  return (
    <div
      data-slot="message-actions"
      className={cn('flex items-center gap-1', className)}
      {...props}
    />
  );
}

export type MessageActionProps = ComponentProps<typeof Button> & {
  /** Optional tooltip text. */
  tooltip?: string;
  /** Accessible name when the children are an icon only. */
  label?: string;
};

/** A ghost `sm` action under a message: an icon with a visible label, or an icon with `label`. */
export function MessageAction({
  tooltip,
  label,
  variant = 'ghost',
  size = 'sm',
  children,
  ...props
}: MessageActionProps) {
  const button = (
    <Button variant={variant} size={size} aria-label={label} {...props}>
      {children}
    </Button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
