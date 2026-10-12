'use client';

import Link from 'next/link';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MessageSquareIcon,
  MoreHorizontal,
  PlusIcon,
  Trash2Icon,
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
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import { ScrollArea } from '@/components/ui/scroll-area';
import { protectedRoutes } from '@/config/routes.config';
import type { ConversationSummary } from '@/types/assistant/types';
import { cn } from '@/lib/utils';

// Structurally the service layer's Page<ConversationSummary>; declared here because a client file
// may not import lib/services (service-layer boundary).
export type ConversationPage = {
  items: ConversationSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
};

export type ConversationDeleteTarget =
  | { kind: 'one'; id: string; title: string }
  | { kind: 'all' };

interface ConversationListProps {
  conversations: ConversationPage;
  timeZone: string;
  onDelete: (target: ConversationDeleteTarget) => void;
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

function pageHref(page: number): string {
  return `?page=${page}`;
}

export function ConversationList({
  conversations,
  timeZone,
  onDelete,
}: ConversationListProps) {
  const { items, page, totalPages } = conversations;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <h2 className="text-sm font-medium lg:sr-only">Recent conversations</h2>
      <div className="flex items-center justify-between gap-2">
        <Link
          href={protectedRoutes.ai}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <PlusIcon data-icon="inline-start" />
          New conversation
        </Link>
        {items.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
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

      {items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareIcon />
            </EmptyMedia>
            <EmptyTitle>No conversations yet</EmptyTitle>
            <EmptyDescription>Ask a question to start one.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ItemGroup className="gap-2">
            {items.map((c) => (
              <Item key={c.id} size="sm" variant="outline">
                <ItemContent className="min-w-0">
                  <Link
                    href={protectedRoutes.aiConversation(c.id)}
                    className="min-w-0 outline-none"
                  >
                    <ItemTitle
                      className="block w-full truncate"
                      title={c.title}
                    >
                      {c.title}
                    </ItemTitle>
                    <ItemDescription>
                      {formatLastMessage(c.lastMessageAt, timeZone)}
                    </ItemDescription>
                  </Link>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete conversation ${c.title}`}
                    onClick={() =>
                      onDelete({ kind: 'one', id: c.id, title: c.title })
                    }
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </ScrollArea>
      )}

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <Link
                href={pageHref(Math.max(1, page - 1))}
                aria-label="Go to previous page"
                aria-disabled={page <= 1}
                className={cn(
                  buttonVariants({ variant: 'ghost' }),
                  page <= 1 && 'pointer-events-none opacity-50'
                )}
              >
                <ChevronLeftIcon data-icon="inline-start" />
                <span className="hidden sm:block">Previous</span>
              </Link>
            </PaginationItem>
            {pages.map((n) => (
              <PaginationItem key={n}>
                <Link
                  href={pageHref(n)}
                  aria-current={n === page ? 'page' : undefined}
                  className={buttonVariants({
                    variant: n === page ? 'outline' : 'ghost',
                    size: 'icon',
                  })}
                >
                  {n}
                </Link>
              </PaginationItem>
            ))}
            <PaginationItem>
              <Link
                href={pageHref(Math.min(totalPages, page + 1))}
                aria-label="Go to next page"
                aria-disabled={page >= totalPages}
                className={cn(
                  buttonVariants({ variant: 'ghost' }),
                  page >= totalPages && 'pointer-events-none opacity-50'
                )}
              >
                <span className="hidden sm:block">Next</span>
                <ChevronRightIcon data-icon="inline-end" />
              </Link>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <p className="text-muted-foreground text-xs">{RETENTION_NOTICE}</p>
    </div>
  );
}
