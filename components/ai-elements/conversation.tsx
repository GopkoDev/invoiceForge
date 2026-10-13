/**
 * Adapted from Vercel AI Elements — https://github.com/vercel/ai-elements
 * packages/elements/src/conversation.tsx at commit 6a9d5b1.
 * Copyright 2023 Vercel, Inc. Licensed under the Apache License, Version 2.0 (see ./LICENSE and ./NOTICE).
 * Modified: rebuilt on @base-ui/react; see ADR-0010
 * (docs/features/ai-chat-v2/adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md).
 * Deviations: driven by useFollowLatest (48 px follow, reduced motion, jump control) instead of use-stick-to-bottom;
 * no role="log" (its implicit live region would announce every streamed delta); ConversationContent is a full-width
 * scroll area holding a centred max-w-3xl column; no ConversationDownload.
 */
'use client';

import { ArrowDownIcon } from 'lucide-react';
import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from 'react';

import { useFollowLatest } from '@/components/ai/use-follow-latest';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type FollowLatest = ReturnType<typeof useFollowLatest>;

interface ConversationContextValue {
  scrollRef: FollowLatest['scrollRef'];
  isAtBottom: boolean;
  scrollToBottom: FollowLatest['jumpToLatest'];
}

const ConversationContext = createContext<ConversationContextValue | null>(
  null
);

/** The follow state of the enclosing Conversation (upstream `useStickToBottomContext`). */
export function useConversationContext(): ConversationContextValue {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('Conversation elements must be used within Conversation');
  }
  return context;
}

export type ConversationProps = ComponentProps<'div'> & {
  /** What changes when new text arrives (messages, a streamed delta): the follow runs on each change. */
  content?: unknown;
  /** A follow state the caller already holds (it also scrolls on send); otherwise the element keeps its own. */
  follow?: FollowLatest;
};

export function Conversation({
  className,
  content,
  follow,
  ...props
}: ConversationProps) {
  const own = useFollowLatest(content);
  const { scrollRef, showJump, jumpToLatest } = follow ?? own;
  return (
    <ConversationContext.Provider
      value={{ scrollRef, isAtBottom: !showJump, scrollToBottom: jumpToLatest }}
    >
      <div
        data-slot="conversation"
        className={cn('relative flex min-h-0 flex-1 flex-col', className)}
        {...props}
      />
    </ConversationContext.Provider>
  );
}

export type ConversationContentProps = ComponentProps<'div'> & {
  /** Classes of the centred column inside the full-width scroll area. */
  columnClassName?: string;
};

export function ConversationContent({
  className,
  columnClassName,
  children,
  ...props
}: ConversationContentProps) {
  const { scrollRef } = useConversationContext();
  return (
    <div
      ref={scrollRef}
      data-slot="conversation-content"
      className={cn('min-h-0 flex-1 overflow-y-auto', className)}
      {...props}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-4',
          columnClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

export type ConversationEmptyStateProps = Omit<
  ComponentProps<'div'>,
  'title'
> & {
  title?: string;
  description?: string;
  icon?: ReactNode;
};

export function ConversationEmptyState({
  className,
  title = 'No messages yet',
  description = 'Start a conversation to see messages here',
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      data-slot="conversation-empty-state"
      className={cn(
        'flex size-full flex-col items-center justify-center gap-3 p-8 text-center',
        className
      )}
      {...props}
    >
      {children ?? (
        <>
          {icon ? <div className="text-muted-foreground">{icon}</div> : null}
          <div className="space-y-1">
            <h3 className="text-sm font-medium">{title}</h3>
            {description ? (
              <p className="text-muted-foreground text-sm">{description}</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

/** Shown only while the end is more than 48 px out of view (AC-16); pressing it jumps back and hides it. */
export function ConversationScrollButton({
  className,
  onClick,
  ...props
}: ConversationScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useConversationContext();
  if (isAtBottom) return null;
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Jump to latest"
      title="Jump to latest"
      className={cn(
        'dark:bg-background dark:hover:bg-muted absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-sm',
        className
      )}
      onClick={(event) => {
        onClick?.(event);
        scrollToBottom();
      }}
      {...props}
    >
      <ArrowDownIcon aria-hidden className="size-4" />
    </Button>
  );
}
