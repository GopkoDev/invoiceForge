'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { legalRoutes } from '@/config/routes.config';
import { X } from 'lucide-react';

const COOKIE_CONSENT_KEY = 'cookie-consent';

export function CookieBanner() {
  const [shouldShow, setShouldShow] = useState<boolean | null>(null);

  useEffect(() => {
    // Use queueMicrotask to avoid setState warning in effect
    queueMicrotask(() => {
      const hasConsent = localStorage.getItem(COOKIE_CONSENT_KEY);
      setShouldShow(!hasConsent);
    });
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    setShouldShow(false);
  };

  // Don't render anything until we know if we should show (avoid hydration mismatch)
  if (shouldShow === null || !shouldShow) {
    return null;
  }

  return (
    <div className="border-border bg-background/95 supports-backdrop-filter:bg-background/80 fixed right-0 bottom-0 left-0 z-50 border-t shadow-lg backdrop-blur">
      <div className="container mx-auto px-4 py-2.5 sm:py-3">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-muted-foreground flex-1 text-xs leading-relaxed sm:text-sm">
            We use strictly necessary session cookies to manage your
            authentication. By using Invoice Forge, you agree to our use of
            these cookies as outlined in our{' '}
            <Link
              href={legalRoutes.privacy}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:text-primary font-medium underline underline-offset-2"
            >
              Privacy Policy
            </Link>
            .
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              onClick={handleAccept}
              className="flex-1 sm:flex-none"
              size="sm"
            >
              Accept
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
