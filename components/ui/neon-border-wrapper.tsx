'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface NeonBorderWrapperProps {
  children: ReactNode;
  className?: string;
  variant?: 'always' | 'hover-only';
  animationSpeed?: 'slow' | 'medium' | 'fast';
}

export function NeonBorderWrapper({
  children,
  className,
  variant = 'hover-only',
  animationSpeed = 'medium',
}: NeonBorderWrapperProps) {
  // Animation speed mapping
  const speedClasses = {
    slow: '[animation-duration:10s]',
    medium: '[animation-duration:6s]',
    fast: '[animation-duration:3s]',
  };

  const isAlwaysVisible = variant === 'always';

  return (
    <div className={cn('group relative', className)}>
      {/* Animated gradient border */}
      <div
        className={cn(
          'absolute -inset-0.5 rounded-[inherit] transition-all duration-500',
          'bg-linear-to-r from-violet-600 via-fuchsia-500 to-cyan-500',
          'dark:from-cyan-400 dark:via-purple-500 dark:to-pink-500',
          'animate-gradient-shift',
          speedClasses[animationSpeed],
          // Always visible variant
          isAlwaysVisible &&
            'opacity-40 blur-sm group-hover:opacity-80 group-hover:blur-md',
          // Hover only variant
          !isAlwaysVisible &&
            'opacity-0 blur-sm group-hover:opacity-80 group-hover:blur-md'
        )}
      />

      {/* Static border glow */}
      <div
        className={cn(
          'absolute -inset-px rounded-[inherit] transition-opacity duration-500',
          'bg-linear-to-r from-violet-500/20 via-fuchsia-500/20 to-cyan-500/20',
          'dark:from-cyan-400/40 dark:via-purple-500/40 dark:to-pink-500/40',
          // Always visible variant
          isAlwaysVisible && 'opacity-50 group-hover:opacity-100',
          // Hover only variant
          !isAlwaysVisible && 'opacity-0 group-hover:opacity-100'
        )}
      />

      {/* Content layer with solid background */}
      <div
        className={cn(
          'relative z-10 h-full w-full rounded-[inherit]',
          'bg-background border transition-colors duration-300',
          isAlwaysVisible
            ? 'border-primary/20 group-hover:border-primary/40'
            : 'border-border/50 group-hover:border-primary/40'
        )}
      >
        {children}
      </div>
    </div>
  );
}
