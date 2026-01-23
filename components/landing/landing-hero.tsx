import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { NeonBorderWrapper } from '@/components/ui/neon-border-wrapper';
import { IconBadge } from './icon-badge';
import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { authRoutes } from '@/config/routes.config';

const defaultCtaHref = authRoutes.signIn;

interface HeroStat {
  label: string;
  value: string;
}

interface LandingHeroProps {
  badge: {
    icon: LucideIcon;
    text: string;
  };
  headline: {
    line1: string;
    line2: string;
  };
  subheadline: string;
  ctaButton: string;
  ctaHref?: string;
  stats: HeroStat[];
}

export function LandingHero({
  badge,
  headline,
  subheadline,
  ctaButton,
  ctaHref = defaultCtaHref,
  stats,
}: LandingHeroProps) {
  return (
    <section className="relative overflow-hidden pt-32 pb-20">
      {/* Gradient Background */}
      <div className="from-primary/10 via-background to-background absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <NeonBorderWrapper
          className="rounded-3xl"
          variant="always"
          animationSpeed="slow"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="rounded-3xl p-12 text-center"
          >
            {/* Beta Badge */}
            <IconBadge icon={badge.icon} text={badge.text} variant="beta" />

            {/* Headline with animated gradient */}
            <h1 className="mb-6 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              {headline.line1}
              <br />
              <span className="animate-gradient-shift bg-linear-to-r from-violet-600 via-fuchsia-500 to-pink-600 bg-clip-text text-transparent dark:from-cyan-400 dark:via-purple-400 dark:to-pink-400">
                {headline.line2}
              </span>
            </h1>

            {/* Sub-headline */}
            <p className="text-muted-foreground mx-auto mb-10 max-w-2xl text-lg sm:text-xl">
              {subheadline}
            </p>

            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href={ctaHref}>
                <Button
                  size="lg"
                  className="group relative w-full overflow-hidden px-8 sm:w-auto"
                >
                  <span className="relative z-10 flex items-center">
                    <span className="animate-gradient-shift bg-linear-to-r from-white via-cyan-100 to-purple-100 bg-clip-text text-transparent dark:from-gray-900 dark:via-purple-900 dark:to-pink-900">
                      {ctaButton}
                    </span>
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Button>
              </Link>
            </div>

            {/* Stats */}
            <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <div className="text-3xl font-bold">{stat.value}</div>
                  <div className="text-muted-foreground text-sm">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </NeonBorderWrapper>
      </div>
    </section>
  );
}
