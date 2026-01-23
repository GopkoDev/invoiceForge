import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { NeonBorderWrapper } from '@/components/ui/neon-border-wrapper';
import { IconBadge } from './icon-badge';
import { SectionContainer } from './section-container';
import type { LucideIcon } from 'lucide-react';
import { authRoutes } from '@/config/routes.config';

const defaultCtaHref = authRoutes.signIn;

interface BetaPricingSectionProps {
  badge: {
    icon: LucideIcon;
    text: string;
  };
  headline: string;
  description: string;
  benefits: string[];
  pricing: {
    amount: string;
    period: string;
    subtitle: string;
  };
  ctaButton: string;
  ctaHref?: string;
  ctaDisclaimer: string;
}

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

export function BetaPricingSection({
  badge,
  headline,
  description,
  benefits,
  pricing,
  ctaButton,
  ctaHref = defaultCtaHref,
  ctaDisclaimer,
}: BetaPricingSectionProps) {
  return (
    <SectionContainer id="pricing">
      <motion.div
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        variants={fadeInUp}
      >
        <NeonBorderWrapper className="rounded-2xl" variant="hover-only">
          <Card className="from-primary/5 to-background overflow-hidden border-0 bg-transparent bg-linear-to-br shadow-none">
            <CardContent className="p-8 sm:p-12">
              <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
                <div>
                  <IconBadge
                    icon={badge.icon}
                    text={badge.text}
                    variant="beta"
                  />
                  <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
                    {headline}
                  </h2>
                  <p className="text-muted-foreground mb-6 text-lg leading-relaxed">
                    {description}
                  </p>
                  <div className="space-y-3">
                    {benefits.map((benefit) => (
                      <div key={benefit} className="flex items-center gap-3">
                        <CheckCircle2 className="text-primary h-5 w-5 shrink-0" />
                        <span>{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card flex flex-col justify-center rounded-lg p-8 shadow-sm">
                  <div className="mb-6">
                    <div className="mb-2 flex items-baseline gap-2">
                      <span className="text-5xl font-bold">
                        {pricing.amount}
                      </span>
                      <span className="text-muted-foreground">
                        {pricing.period}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {pricing.subtitle}
                    </p>
                  </div>

                  <Link href={ctaHref}>
                    <Button size="lg" className="mb-4 w-full">
                      {ctaButton}
                    </Button>
                  </Link>

                  <p className="text-muted-foreground text-center text-xs">
                    {ctaDisclaimer}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </NeonBorderWrapper>
      </motion.div>
    </SectionContainer>
  );
}
