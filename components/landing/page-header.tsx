import React from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  icon?: LucideIcon;
  badge?: string;
  headline?: string;
  highlightedText?: string;
  subheadline?: string;
  className?: string;
  children?: React.ReactNode;
}

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

export function PageHeader({
  icon: Icon,
  badge,
  headline,
  highlightedText,
  subheadline,
  className,
  children,
}: PageHeaderProps) {
  return (
    <motion.div {...fadeInUp} className={cn('text-center', className)}>
      {badge && Icon && (
        <Badge className="bg-secondary/6 border-border/30 text-foreground dark:bg-secondary/12 dark:border-border/40 mb-6 inline-flex h-9 items-center justify-center rounded-full border-2 px-4 py-1 text-sm leading-none font-semibold whitespace-nowrap shadow-md sm:px-5">
          <Icon className="mr-2 h-4 w-4" />
          {badge}
        </Badge>
      )}
      {badge && !Icon && (
        <Badge className="bg-secondary/6 border-border/30 text-foreground dark:bg-secondary/12 dark:border-border/40 mb-6 inline-flex h-9 items-center justify-center rounded-full border-2 px-4 py-1 text-sm leading-none font-semibold whitespace-nowrap shadow-md sm:px-5">
          {badge}
        </Badge>
      )}
      <h1 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
        {headline}{' '}
        {highlightedText && (
          <span className="animate-gradient-shift bg-linear-to-r from-violet-600 via-fuchsia-500 to-pink-600 bg-clip-text text-transparent dark:from-cyan-400 dark:via-purple-400 dark:to-pink-400">
            {highlightedText}
          </span>
        )}
      </h1>
      {subheadline && (
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          {subheadline}
        </p>
      )}
      {children}
    </motion.div>
  );
}
