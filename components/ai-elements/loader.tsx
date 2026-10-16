/**
 * Adapted from Vercel AI Elements — https://github.com/vercel/ai-elements
 * replaces packages/elements/src/shimmer.tsx at commit 6a9d5b1 (the "thinking" indicator).
 * Copyright 2023 Vercel, Inc. Licensed under the Apache License, Version 2.0 (see ./LICENSE and ./NOTICE).
 * Modified: rebuilt on @base-ui/react; see ADR-0010
 * (docs/features/ai-chat-v2/adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md).
 * Deviations: the project's Spinner instead of the motion-based Shimmer (no new dependency); static under
 * prefers-reduced-motion; a screen-reader status separate from the visible label.
 */
import type { HTMLAttributes } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export type LoaderProps = HTMLAttributes<HTMLDivElement> & {
  /** Visible text beside the spinner, e.g. "Thinking…". */
  label?: string;
  /** What a screen reader hears; defaults to the label. */
  announce?: string;
};

export function Loader({ label, announce, className, ...props }: LoaderProps) {
  return (
    <div
      data-slot="loader"
      className={cn(
        'text-muted-foreground flex items-center gap-2 text-sm',
        className
      )}
      {...props}
    >
      <Spinner
        aria-hidden="true"
        role="presentation"
        className="motion-reduce:animate-none"
      />
      {label ? <span>{label}</span> : null}
      <span role="status" className="sr-only">
        {announce ?? label ?? 'Loading'}
      </span>
    </div>
  );
}
