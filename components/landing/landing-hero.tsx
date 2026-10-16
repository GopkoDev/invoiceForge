import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { authRoutes } from '@/config/routes.config';
import type { LandingDemoSample } from '@/constants/public-pages-content';
import { IconBadge } from './icon-badge';
import { LandingDemo } from './landing-demo/landing-demo';

const defaultCtaHref = authRoutes.signIn;

interface LandingHeroProps {
  badge: {
    icon: LucideIcon;
    text: string;
  };
  headline: string;
  supportingLine: string;
  ctaButton: string;
  ctaHref?: string;
  demo: LandingDemoSample;
}

export function LandingHero({
  badge,
  headline,
  supportingLine,
  ctaButton,
  ctaHref = defaultCtaHref,
  demo,
}: LandingHeroProps) {
  return (
    <section className="relative overflow-hidden pt-24 pb-12 sm:pt-28 sm:pb-16 lg:pt-32 lg:pb-24">
      {/* Gradient Background */}
      <div className="from-primary/10 via-background to-background absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))]" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16 lg:px-8">
        <div className="text-center lg:text-left">
          <IconBadge icon={badge.icon} text={badge.text} variant="beta" />

          <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
            <span className="animate-gradient-shift bg-linear-to-r from-violet-600 via-fuchsia-500 to-pink-600 bg-clip-text text-transparent dark:from-cyan-400 dark:via-purple-400 dark:to-pink-400">
              {headline}
            </span>
          </h1>

          <p className="text-muted-foreground mx-auto mb-6 max-w-2xl text-base sm:text-lg lg:mx-0 lg:mb-8 lg:max-w-xl">
            {supportingLine}
          </p>

          <div className="flex justify-center lg:justify-start">
            <Link
              href={ctaHref}
              className={cn(
                buttonVariants({ size: 'lg' }),
                'group w-full px-8 sm:w-auto'
              )}
            >
              {ctaButton}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        <LandingDemo sample={demo} />
      </div>
    </section>
  );
}
