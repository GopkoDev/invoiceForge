'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquareIcon, MoreHorizontal, PlusIcon, SearchIcon, Trash2Icon, XIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { ScrollArea } from '@/components/ui/scroll-area';
import { protectedRoutes } from '@/config/routes.config';
import { filterByTitle, groupConversations } from '@/lib/helpers/conversation-groups';
import type { ConversationSummary } from '@/types/assistant/types';
import { cn } from '@/lib/utils';

export type ConversationDeleteTarget = { kind: 'one'; id: string; title: string } | { kind: 'all' };

interface ConversationListProps {
  /** Every Conversation of the Freelancer, newest last message first (listConversationSummaries). */
  conversations: ConversationSummary[];
  timeZone: string;
  onDelete: (target: ConversationDeleteTarget) => void;
  /** A row or New chat was picked: the phone sheet closes on it (SCR-01 phone sheet). */
  onPick?: () => void;
}

export const RETENTION_NOTICE = 'Conversations are kept for 90 days after their last message.';

// "10 Oct 2026": the day of the last message in the Freelancer's zone (ADR-0006).
function formatLastMessage(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(
    new Date(iso)
  );
}

/** The id of the Conversation open at `/ai/{id}`, or null. */
function openConversationId(pathname: string | null): string | null {
  const match = pathname?.match(/^\/ai\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * ai-chat-v2 T19 (SCR-01; AC-15, AC-17, AC-19): the Conversation list. A header with the actions menu, a search
 * that folds case, spaces and look-alike letters (no request), the rows grouped by the last message's day in the
 * Freelancer time zone in their own scroll area, and a footer that is always visible: New chat above the retention
 * notice. Opening, listing and searching write and count nothing.
 */
export function ConversationList({ conversations, timeZone, onDelete, onPick }: ConversationListProps) {
  const [query, setQuery] = useState('');
  const currentId = openConversationId(usePathname());
  const matches = filterByTitle(conversations, query);
  const groups = groupConversations(matches, new Date(), timeZone);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Conversations</h2>
        {conversations.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Conversation actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onClick={() => onDelete({ kind: 'all' })}>
                Delete all
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <InputGroup>
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
            <InputGroupButton size="icon-xs" aria-label="Clear search text" onClick={() => setQuery('')}>
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

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
            <EmptyDescription>No conversation matches &quot;{query}&quot;.</EmptyDescription>
          </EmptyHeader>
          <Button variant="link" size="sm" onClick={() => setQuery('')}>
            Clear search
          </Button>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 pr-2">
            {groups.map((group) => (
              <section key={group.key} aria-labelledby={`conversation-group-${group.key}`} className="flex flex-col gap-2">
                <h3 id={`conversation-group-${group.key}`} className="text-muted-foreground px-1 text-xs font-medium">
                  {group.label}
                </h3>
                <ItemGroup className="gap-1">
                  {group.items.map((c) => {
                    const current = c.id === currentId;
                    return (
                      <Item key={c.id} role="listitem" size="sm" variant="outline" className={cn(current && 'bg-accent')}>
                        <ItemContent className="min-w-0">
                          <Link
                            href={protectedRoutes.aiConversation(c.id)}
                            aria-current={current ? 'page' : undefined}
                            className="min-w-0 outline-none"
                            onClick={onPick}
                          >
                            <ItemTitle className="block w-full truncate" title={c.title}>
                              {c.title}
                            </ItemTitle>
                            {/* On the open row's accent background the muted colour fails contrast (axe, T31). */}
                            <ItemDescription className={cn(current && 'text-accent-foreground')}>
                              {formatLastMessage(c.lastMessageAt, timeZone)}
                            </ItemDescription>
                          </Link>
                        </ItemContent>
                        <ItemActions>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Delete conversation ${c.title}`}
                            onClick={() => onDelete({ kind: 'one', id: c.id, title: c.title })}
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </ItemActions>
                      </Item>
                    );
                  })}
                </ItemGroup>
              </section>
            ))}
          </div>
        </ScrollArea>
      )}

      <div className="flex shrink-0 flex-col gap-2 border-t pt-3">
        <Link href={protectedRoutes.ai} className={cn(buttonVariants({ variant: 'default' }), 'w-full')} onClick={onPick}>
          <PlusIcon data-icon="inline-start" />
          New chat
        </Link>
        <p className="text-muted-foreground text-xs">{RETENTION_NOTICE}</p>
      </div>
    </div>
  );
}
