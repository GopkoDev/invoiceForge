/**
 * Adapted from Vercel AI Elements — https://github.com/vercel/ai-elements
 * packages/elements/src/suggestion.tsx at commit 6a9d5b1.
 * Copyright 2023 Vercel, Inc. Licensed under the Apache License, Version 2.0 (see ./LICENSE and ./NOTICE).
 * Modified: rebuilt on @base-ui/react; see ADR-0010
 * (docs/features/ai-chat-v2/adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md).
 * Deviations: Suggestions wraps onto lines instead of a horizontal ScrollArea.
 */
'use client';

import type { ComponentProps, HTMLAttributes } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SuggestionsProps = HTMLAttributes<HTMLDivElement>;

export function Suggestions({ className, ...props }: SuggestionsProps) {
  return (
    <div
      data-slot="suggestions"
      className={cn('flex flex-wrap items-center gap-2', className)}
      {...props}
    />
  );
}

export type SuggestionProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  suggestion: string;
  /** Reports the suggestion's text; it sends nothing itself. */
  onClick?: (suggestion: string) => void;
};

export function Suggestion({
  suggestion,
  onClick,
  className,
  variant = 'outline',
  size = 'sm',
  children,
  ...props
}: SuggestionProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={cn('rounded-full px-3 font-normal', className)}
      onClick={() => onClick?.(suggestion)}
      {...props}
    >
      {children ?? suggestion}
    </Button>
  );
}
