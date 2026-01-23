import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ModeToggle } from '@/components/teheme-toggle';
import { Logo } from '@/components/custom-icons/logo';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authRoutes } from '@/config/routes.config';

const defaultCtaHref = authRoutes.signIn;

interface NavigationLink {
  label: string;
  href: string;
}

interface LandingNavProps {
  brandName: string;
  links?: NavigationLink[];
  ctaButton?: string;
  ctaHref?: string;
  className?: string;
}

export function LandingNav({
  brandName,
  links = [],
  ctaButton = 'Get Started',
  ctaHref = defaultCtaHref,
  className,
}: LandingNavProps) {
  return (
    <nav
      className={cn(
        'bg-background/80 fixed top-0 z-50 w-full border-b backdrop-blur-lg',
        className
      )}
      aria-label="Main navigation"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-label="Invoice Forge homepage"
          >
            <Logo size={32} />
            <span className="text-xl font-bold">{brandName}</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden items-center gap-6 md:flex">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                aria-label={link.label}
                onClick={(e) => {
                  if (link.href.startsWith('#')) {
                    e.preventDefault();
                    const element = document.querySelector(link.href);
                    if (element) {
                      element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                      // Update URL without adding to history
                      window.history.replaceState(null, '', link.href);
                    }
                  }
                }}
                className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
              >
                {link.label}
              </a>
            ))}

            <ModeToggle />

            <Link href={ctaHref}>
              <Button size="sm">{ctaButton}</Button>
            </Link>
          </div>

          {/* Mobile Menu - Get Started Only */}
          <div className="flex items-center gap-2 md:hidden">
            <ModeToggle />
            <Link href={ctaHref}>
              <Button
                size="sm"
                className="flex items-center gap-1.5"
                aria-label={ctaButton}
              >
                {ctaButton}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
