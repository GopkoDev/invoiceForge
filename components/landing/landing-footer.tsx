import React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/custom-icons/logo';
import { cn } from '@/lib/utils';

interface FooterSection {
  title: string;
  links: Array<{ label: string; href: string }>;
}

interface LandingFooterProps {
  brandName: string;
  description: string;
  sections: FooterSection[];
  copyright: string;
  disclaimer?: string;
  className?: string;
}

export function LandingFooter({
  brandName,
  description,
  sections,
  copyright,
  disclaimer,
  className,
}: LandingFooterProps) {
  return (
    <footer className={cn('border-t py-12', className)} role="contentinfo">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <Logo size={32} />
              <span className="text-xl font-bold">{brandName}</span>
            </div>
            <p className="text-muted-foreground max-w-sm text-sm">
              {description}
            </p>
          </div>

          {/* Sections */}
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="mb-4 font-semibold">{section.title}</h3>
              <ul className="text-muted-foreground space-y-2 text-sm">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="hover:text-foreground transition-colors"
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
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-muted-foreground mt-12 border-t pt-8 text-center text-sm">
          <p className="mb-3">{copyright}</p>
          {disclaimer && (
            <p className="mx-auto max-w-3xl text-xs opacity-70">{disclaimer}</p>
          )}
        </div>
      </div>
    </footer>
  );
}
