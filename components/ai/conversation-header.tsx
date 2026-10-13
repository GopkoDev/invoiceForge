'use client';

import Link from 'next/link';
import { MoreHorizontal, PlusIcon } from 'lucide-react';
import { ConversationListButton } from '@/components/ai/ai-workspace';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { protectedRoutes } from '@/config/routes.config';
import { cn } from '@/lib/utils';

interface ConversationHeaderProps {
  title: string;
  onDelete: () => void;
}

/**
 * SCR-03 header (presentation per ai-chat-v2 T36, screens.md «Header»): one h-12 row with a bottom border: the list
 * button (below md, and up to xl with the preview open), the truncated title, New conversation and the actions menu.
 */
export function ConversationHeader({
  title,
  onDelete,
}: ConversationHeaderProps) {
  return (
    <div
      data-slot="chat-header"
      className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-2 md:px-4"
    >
      <div className="flex min-w-0 items-center gap-1">
        <ConversationListButton />
        <h1 className="min-w-0 truncate text-sm font-medium" title={title}>
          {title}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={protectedRoutes.ai}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        >
          <PlusIcon data-icon="inline-start" />
          {/* Icon-only on a phone so the title keeps its room; the name stays for screen readers. */}
          <span className="sr-only sm:not-sr-only">New conversation</span>
        </Link>
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
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete conversation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
