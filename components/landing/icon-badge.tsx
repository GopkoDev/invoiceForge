import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface IconBadgeProps {
  icon: LucideIcon;
  text: string;
  variant?: 'default' | 'beta';
  className?: string;
}

export function IconBadge({
  icon: Icon,
  text,
  variant = 'default',
  className,
}: IconBadgeProps) {
  const baseClasses =
    'mb-6 inline-flex min-h-[36px] items-center justify-center gap-2 rounded-full border-2 px-5 py-2 text-sm leading-none font-semibold whitespace-nowrap shadow-lg';

  const variantClasses = {
    default:
      'bg-secondary/6 border-border/30 text-foreground dark:bg-secondary/12 dark:border-border/40 shadow-md',
    beta: 'text-foreground dark:text-foreground border-purple-600/30 bg-purple-600/6 dark:border-purple-400/30 dark:bg-purple-500/12',
  };

  return (
    <Badge className={cn(baseClasses, variantClasses[variant], className)}>
      <Icon className="h-4 w-4" />
      {text}
    </Badge>
  );
}
