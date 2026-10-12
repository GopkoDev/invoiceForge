'use client';

import Link from 'next/link';
import { ArrowLeftIcon, MoreHorizontal, PlusIcon } from 'lucide-react';
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

export function ConversationHeader({ title, onDelete }: ConversationHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={protectedRoutes.ai}
        className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline lg:hidden"
      >
        <ArrowLeftIcon className="size-4" />
        All conversations
      </Link>
      <div className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 truncate text-lg font-semibold" title={title}>
          {title}
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <Link href={protectedRoutes.ai} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <PlusIcon data-icon="inline-start" />
            New conversation
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Conversation actions">
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
    </div>
  );
}
