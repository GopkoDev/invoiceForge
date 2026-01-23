import React from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import type { LucideIcon } from 'lucide-react';

interface LegalHeroProps {
  icon: LucideIcon;
  badge: string;
  headline: string;
  highlightedText: string;
  subheadline: string;
  effectiveDate: string;
  lastUpdated: string;
}

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

export function LegalHero({
  icon: Icon,
  badge,
  headline,
  highlightedText,
  subheadline,
  effectiveDate,
  lastUpdated,
}: LegalHeroProps) {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center">
          <Badge className="bg-secondary/6 border-border/30 text-foreground dark:bg-secondary/12 dark:border-border/40 mb-6 inline-flex h-9 items-center justify-center rounded-full border-2 px-4 py-1 text-sm leading-none font-semibold whitespace-nowrap shadow-md sm:px-5">
            <Icon className="mr-2 h-4 w-4" />
            {badge}
          </Badge>
          <h1 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            {headline}{' '}
            <span className="animate-gradient-shift bg-linear-to-r from-violet-600 via-fuchsia-500 to-pink-600 bg-clip-text text-transparent dark:from-cyan-400 dark:via-purple-400 dark:to-pink-400">
              {highlightedText}
            </span>
          </h1>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
            {subheadline}
          </p>
          <p className="text-muted-foreground mt-4 text-sm">
            <strong>Effective Date:</strong> {effectiveDate} |{' '}
            <strong>Last Updated:</strong> {lastUpdated}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
