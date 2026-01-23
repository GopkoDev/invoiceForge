import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { NeonBorderWrapper } from '@/components/ui/neon-border-wrapper';
import { cn } from '@/lib/utils';

interface ContentCardProps {
  children: React.ReactNode;
  variant?: 'always' | 'hover-only' | 'none';
  className?: string;
  contentClassName?: string;
}

export function ContentCard({
  children,
  variant = 'hover-only',
  className,
  contentClassName,
}: ContentCardProps) {
  if (variant === 'none') {
    return (
      <Card className={cn('border-0 bg-transparent shadow-none', className)}>
        <CardContent className={cn('p-8', contentClassName)}>
          {children}
        </CardContent>
      </Card>
    );
  }

  return (
    <NeonBorderWrapper
      className={cn('rounded-2xl', className)}
      variant={variant}
    >
      <Card className="border-0 bg-transparent shadow-none">
        <CardContent className={cn('p-8', contentClassName)}>
          {children}
        </CardContent>
      </Card>
    </NeonBorderWrapper>
  );
}
