/**
 * Adapted from Vercel AI Elements — https://github.com/vercel/ai-elements
 * packages/elements/src/message.tsx at commit 6a9d5b1.
 * Copyright 2023 Vercel, Inc. Licensed under the Apache License, Version 2.0 (see ./LICENSE and ./NOTICE).
 * Modified: rebuilt on @base-ui/react; see ADR-0010
 * (docs/features/ai-chat-v2/adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md).
 * Deviations: MessageResponse renders safe Markdown via react-markdown + remark-gfm (no streamdown, no raw HTML, no
 * images, no headings or checkboxes, links only to in-app paths; ai-chat-v2 T62, ADR-0012, supersedes ai-assistant AC-07); Message sets `data-role`; MessageAvatar comes from the earlier upstream API; MessageAction is a
 * labelled ghost button (Base UI Tooltip via `render`, no asChild); no branch selector or toolbar.
 */
'use client';

import { SparklesIcon } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
import { isInAppPath } from '@/lib/ai/in-app-links';
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
    <div className="flex h-6 shrink-0 items-center">
      <Avatar
        data-slot="message-avatar"
        size="sm"
        aria-hidden
        className={className}
        {...props}
      >
        {src ? <AvatarImage src={src} alt={name ?? ''} /> : null}
        <AvatarFallback className="bg-primary text-primary-foreground">
          {fallback ?? <SparklesIcon className="size-3.5" />}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}

export type MessageResponseProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'children'
> & {
  children: string;
  /** True while the reply is still being written; the output is the same as for a saved reply (AC-44). */
  streaming?: boolean;
};

type MdNode = { type: string; value?: string; children?: MdNode[] };

/** Turns raw HTML in the Markdown tree into literal text, so it is shown as typed and never parsed (AC-43). */
function remarkHtmlAsText() {
  const walk = (node: MdNode): void => {
    if (!node.children) return;
    node.children = node.children.map((child) => {
      if (child.type === 'html') {
        return { type: 'text', value: child.value ?? '' };
      }
      walk(child);
      return child;
    });
  };
  return (tree: MdNode) => {
    walk(tree);
    // A block-level html node is now a bare text node directly under the root: wrap it in a paragraph.
    tree.children = (tree.children ?? []).map((child) =>
      child.type === 'text' ? { type: 'paragraph', children: [child] } : child
    );
  };
}

const ALLOWED_ELEMENTS = [
  'p',
  'br',
  'strong',
  'em',
  'del',
  'code',
  'pre',
  'blockquote',
  'hr',
  'ul',
  'ol',
  'li',
  'a',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
] as const;

const REMARK_PLUGINS = [remarkGfm, remarkHtmlAsText];

/** An inline element with no content is never rendered (a half-written mark must not leave an empty element). */
function hasContent(children: ReactNode): boolean {
  return Array.isArray(children)
    ? children.length > 0
    : children != null && children !== '';
}

const COMPONENTS: Components = {
  a: ({ href, children }) => {
    if (!href || !isInAppPath(href)) return <>{children}</>;
    return (
      <Link
        href={href}
        className="text-primary font-medium underline underline-offset-2"
      >
        {children}
      </Link>
    );
  },
  strong: ({ children }) =>
    hasContent(children) ? (
      <strong className="font-semibold">{children}</strong>
    ) : null,
  em: ({ children }) => (hasContent(children) ? <em>{children}</em> : null),
  del: ({ children }) => (hasContent(children) ? <del>{children}</del> : null),
  code: ({ children, className }) =>
    hasContent(children) ? (
      <code
        className={cn(
          'bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]',
          className
        )}
      >
        {children}
      </code>
    ) : null,
  pre: ({ children }) => (
    <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  p: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-5">{children}</ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-border text-muted-foreground border-l-2 pl-3">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-border border-b px-2 py-1 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-border border-b px-2 py-1">{children}</td>
  ),
};

/**
 * A reply's text as safe Markdown (ai-chat-v2 AC-42..44, ADR-0012): no raw HTML (shown as text), no images, no headings
 * or checkboxes (their text stays), a single newline in a paragraph shows as a break, and a link
 * only when its address is an in-app path; every other link shows its label as plain text. A half-written mark is
 * shown as typed until it closes, and a streamed reply renders exactly like the saved one.
 */
export function MessageResponse({
  className,
  children,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- streamed and saved replies render identically
  streaming: _streaming,
  ...props
}: MessageResponseProps) {
  return (
    <div
      data-slot="message-response"
      className={cn(
        'space-y-2 leading-6 break-words [&>:first-child]:mt-0 [&>:last-child]:mb-0',
        className
      )}
      {...props}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        urlTransform={(url) => (isInAppPath(url) ? url : '')}
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
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
