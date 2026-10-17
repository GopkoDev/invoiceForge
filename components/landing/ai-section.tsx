import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { authRoutes } from '@/config/routes.config';
import { ContentCard } from './content-card';
import { IconBadge } from './icon-badge';
import { SectionContainer } from './section-container';

interface AiBlock {
  title: string;
  items: readonly string[];
}

interface AiSectionProps {
  badge: string;
  h2: string;
  does: AiBlock;
  never: AiBlock;
  ownTools: AiBlock;
  smallPrint: string;
  privacyLink: { label: string; href: string };
  ctaButton: string;
}

export function AiSection({
  badge,
  h2,
  does,
  never,
  ownTools,
  smallPrint,
  privacyLink,
  ctaButton,
}: AiSectionProps) {
  const blocks = [does, never, ownTools];

  return (
    <SectionContainer id="ai" aria-labelledby="ai-heading">
      <div className="text-center">
        <IconBadge icon={Sparkles} text={badge} />
        <h2
          id="ai-heading"
          className="mx-auto mb-12 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl"
        >
          {h2}
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {blocks.map((block) => (
          <ContentCard
            key={block.title}
            className="h-full"
            contentClassName="p-6"
          >
            <h3 className="mb-4 text-xl font-semibold">{block.title}</h3>
            <ul className="text-muted-foreground space-y-3 text-sm leading-relaxed">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </ContentCard>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center gap-4 text-center">
        <p className="text-muted-foreground text-xs">{smallPrint}</p>
        <Link
          href={privacyLink.href}
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          {privacyLink.label}
        </Link>
        <Link
          href={authRoutes.signIn}
          className={cn(
            buttonVariants({ size: 'lg' }),
            'group w-full px-8 sm:w-auto'
          )}
        >
          {ctaButton}
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </SectionContainer>
  );
}
