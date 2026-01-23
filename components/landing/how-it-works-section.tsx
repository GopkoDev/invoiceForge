import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { NeonBorderWrapper } from '@/components/ui/neon-border-wrapper';
import { PageHeader } from './page-header';
import { SectionContainer } from './section-container';

interface HowItWorksStep {
  step: string;
  title: string;
  description: string;
}

interface HowItWorksSectionProps {
  badge: string;
  headline: string;
  subheadline: string;
  steps: HowItWorksStep[];
}

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export function HowItWorksSection({
  badge,
  headline,
  subheadline,
  steps,
}: HowItWorksSectionProps) {
  return (
    <SectionContainer id="how-it-works" aria-labelledby="how-it-works-heading">
      <motion.div
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        variants={stagger}
      >
        <motion.div variants={fadeInUp} className="mb-16 text-center">
          <PageHeader
            badge={badge}
            headline={headline.split('3 simple steps')[0]}
            highlightedText="3 simple steps"
            subheadline={subheadline}
            headingId="how-it-works-heading"
          />
        </motion.div>

        <div className="grid gap-8 lg:grid-cols-3">
          {steps.map((step, index) => (
            <motion.div
              key={step.step}
              variants={fadeInUp}
              className="relative"
            >
              <NeonBorderWrapper
                className="h-full rounded-xl"
                variant="hover-only"
              >
                <Card className="h-full border-0 bg-transparent shadow-none">
                  <CardContent className="p-6">
                    <div className="bg-primary text-primary-foreground mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg text-xl font-bold">
                      {step.step}
                    </div>
                    <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              </NeonBorderWrapper>

              {/* Connector Arrow */}
              {index < steps.length - 1 && (
                <div className="bg-primary absolute top-1/2 -right-4 hidden h-0.5 w-8 lg:block" />
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </SectionContainer>
  );
}
