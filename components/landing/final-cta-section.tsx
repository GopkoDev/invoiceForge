import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { NeonBorderWrapper } from '@/components/ui/neon-border-wrapper';
import { ArrowRight } from 'lucide-react';
import { SectionContainer } from './section-container';
import { authRoutes } from '@/config/routes.config';

const defaultCtaHref = authRoutes.signIn;

interface FinalCtaSectionProps {
  headline: string;
  subheadline: string;
  ctaButton: string;
  ctaHref?: string;
  disclaimer: string;
}

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

export function FinalCtaSection({
  headline,
  subheadline,
  ctaButton,
  ctaHref = defaultCtaHref,
  disclaimer,
}: FinalCtaSectionProps) {
  return (
    <SectionContainer>
      <NeonBorderWrapper className="rounded-2xl" variant="hover-only">
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          variants={fadeInUp}
          className="from-primary/10 to-background relative overflow-hidden rounded-2xl bg-linear-to-br p-12 text-center"
        >
          {/* Background Glow */}
          <div className="from-primary/10 absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] via-transparent to-transparent" />

          <div className="relative">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">{headline}</h2>
            <p className="text-muted-foreground mx-auto mb-8 max-w-2xl text-lg">
              {subheadline}
            </p>

            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href={ctaHref}>
                <Button size="lg" className="group w-full px-8 sm:w-auto">
                  {ctaButton}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>

            <p className="text-muted-foreground mt-6 text-sm">{disclaimer}</p>
          </div>
        </motion.div>
      </NeonBorderWrapper>
    </SectionContainer>
  );
}
