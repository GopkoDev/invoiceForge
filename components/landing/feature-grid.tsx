import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { NeonBorderWrapper } from '@/components/ui/neon-border-wrapper';
import { PageHeader } from './page-header';
import { SectionContainer } from './section-container';
import type { LucideIcon } from 'lucide-react';

interface FeatureItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

interface FeatureGridProps {
  badge: string;
  headline: string;
  subheadline: string;
  features: FeatureItem[];
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

export function FeatureGrid({
  badge,
  headline,
  subheadline,
  features,
}: FeatureGridProps) {
  return (
    <SectionContainer id="features">
      <motion.div
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        variants={stagger}
        className="text-center"
      >
        <motion.div variants={fadeInUp}>
          <PageHeader
            badge={badge}
            headline={headline.split('Beautiful Design')[0]}
            highlightedText="Beautiful Design"
            subheadline={subheadline}
          />
        </motion.div>

        <motion.div
          variants={stagger}
          className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature) => (
            <motion.div key={feature.title} variants={fadeInUp}>
              <NeonBorderWrapper
                className="h-full rounded-xl"
                variant="hover-only"
              >
                <Card className="h-full border-0 bg-transparent shadow-none">
                  <CardContent className="p-6">
                    <div className="bg-primary/10 mb-4 inline-flex rounded-lg p-3">
                      <feature.icon className="text-primary h-6 w-6" />
                    </div>
                    <h3 className="mb-2 text-xl font-semibold">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </NeonBorderWrapper>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </SectionContainer>
  );
}
