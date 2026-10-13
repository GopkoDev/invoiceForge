'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import {
  MessageSquareIcon,
  MoreHorizontal,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { protectedRoutes } from '@/config/routes.config';
import {
  filterByTitle,
  groupConversations,
} from '@/lib/helpers/conversation-groups';
import type { ConversationSummary } from '@/types/assistant/types';
import { cn } from '@/lib/utils';

export type ConversationDeleteTarget =
  | { kind: 'one'; id: string; title: string }
  | { kind: 'all' };

interface ConversationListProps {
  /** Every Conversation of the Freelancer, newest last message first (listConversationSummaries). */
  conversations: ConversationSummary[];
  timeZone: string;
  onDelete: (target: ConversationDeleteTarget) => void;
  /** A row or New chat was picked: the phone sheet closes on it (SCR-01 phone sheet). */
  onPick?: () => void;
}

export const RETENTION_NOTICE =
  'Conversations are kept for 90 days after their last message.';

// "10 Oct 2026": the day of the last message in the Freelancer's zone (ADR-0006).
function formatLastMessage(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(new Date(iso));
}

/** The id of the Conversation open at `/ai/{id}`, or null. */
export function openConversationId(pathname: string | null): string | null {
  const match = pathname?.match(/^\/ai\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * ai-chat-v2 T19 (SCR-01; AC-15, AC-17, AC-19), presentation per T35 (ADR-0010): the Conversation list. A top row
 * with the search (folds case, spaces and look-alike letters; no request) and the actions menu, the rows grouped by
 * the last message's day in the Freelancer time zone under small muted labels in their own scroll area, each a plain
 * one-line link with a ⋯ menu (Delete) shown on hover, focus, the current row or touch, and a footer that is always
 * visible: New chat above the retention notice. Opening, listing and searching write and count nothing.
 */
export function ConversationList({
  conversations,
  timeZone,
  onDelete,
  onPick,
}: ConversationListProps) {
  const [query, setQuery] = useState('');
  const currentId = useSelectedLayoutSegment();
  const matches = filterByTitle(conversations, query);
  const groups = groupConversations(matches, new Date(), timeZone);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The landmark keeps its name; the search row is the visible top of the pane (ref/reference-empty-state.png). */}
      <h2 className="sr-only">Conversations</h2>
      <div
        data-slot="conversation-list-top"
        className="flex h-12 shrink-0 items-center gap-1 border-b px-2"
      >
        <InputGroup className="h-8 border-transparent shadow-none dark:bg-transparent">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            disabled={conversations.length === 0}
          />
          {query !== '' && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Clear search text"
                onClick={() => setQuery('')}
              >
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        {conversations.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-8"
                  aria-label="Conversation actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete({ kind: 'all' })}
              >
                Delete all
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {conversations.length === 0 ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareIcon />
            </EmptyMedia>
            <EmptyTitle>No conversations yet</EmptyTitle>
            <EmptyDescription>Ask a question to start one.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : matches.length === 0 ? (
        <Empty className="flex-1 p-4">
          <EmptyHeader>
            <EmptyDescription>
              No conversation matches &quot;{query}&quot;.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="link" size="sm" onClick={() => setQuery('')}>
            Clear search
          </Button>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col px-2 pb-2">
            {groups.map((group) => (
              <section
                key={group.key}
                aria-labelledby={`conversation-group-${group.key}`}
                className="flex flex-col"
              >
                <h3
                  id={`conversation-group-${group.key}`}
                  className="text-muted-foreground px-3 pt-4 pb-1 text-xs font-normal"
                >
                  {group.label}
                </h3>
                <div role="list" className="flex flex-col gap-0.5">
                  {group.items.map((c) => {
                    const current = c.id === currentId;
                    return (
                      <div
                        key={c.id}
                        role="listitem"
                        className={cn(
                          'group/row hover:bg-accent/60 relative flex h-9 items-center rounded-md text-sm',
                          current &&
                            'bg-accent text-accent-foreground hover:bg-accent font-medium'
                        )}
                      >
                        <Link
                          href={protectedRoutes.aiConversation(c.id)}
                          aria-current={current ? 'page' : undefined}
                          title={`${c.title}\nLast message ${formatLastMessage(c.lastMessageAt, timeZone)}`}
                          className="focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 items-center rounded-md pr-1 pl-3 outline-none focus-visible:ring-[3px]"
                          onClick={onPick}
                        >
                          <span className="truncate">{c.title}</span>
                        </Link>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Actions for ${c.title}`}
                                className={cn(
                                  'mr-1 shrink-0 hover:bg-transparent aria-expanded:opacity-100',
                                  current
                                    ? 'opacity-100'
                                    : 'opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100'
                                )}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() =>
                                onDelete({
                                  kind: 'one',
                                  id: c.id,
                                  title: c.title,
                                })
                              }
                            >
                              <Trash2Icon />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>
      )}

      <div className="flex shrink-0 flex-col gap-2 border-t p-3">
        <Link
          href={protectedRoutes.ai}
          className={cn(buttonVariants({ variant: 'default' }), 'w-full')}
          onClick={onPick}
        >
          <PlusIcon data-icon="inline-start" />
          New chat
        </Link>
        <p className="text-muted-foreground text-xs">{RETENTION_NOTICE}</p>
      </div>
    </div>
  );
}
