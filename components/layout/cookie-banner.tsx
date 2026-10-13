'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { legalRoutes } from '@/config/routes.config';

const COOKIE_CONSENT_KEY = 'cookie-consent';
/**
 * The banner's height on <html> while it shows, so a full-height layout (the AI section, ai-chat-v2 AC-15) keeps its
 * bottom-docked controls above the banner instead of under it. Unset when the banner is not shown.
 */
export const COOKIE_BANNER_HEIGHT_VAR = '--cookie-banner-height';

export function CookieBanner() {
  const [shouldShow, setShouldShow] = useState<boolean | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Use queueMicrotask to avoid setState warning in effect
    queueMicrotask(() => {
      const hasConsent = localStorage.getItem(COOKIE_CONSENT_KEY);
      setShouldShow(!hasConsent);
    });
  }, []);

  useLayoutEffect(() => {
    const banner = bannerRef.current;
    if (!shouldShow || !banner) return;
    const root = document.documentElement.style;
    const publish = () =>
      root.setProperty(
        COOKIE_BANNER_HEIGHT_VAR,
        `${Math.ceil(banner.getBoundingClientRect().height)}px`
      );
    publish();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(publish);
    observer?.observe(banner);
    return () => {
      observer?.disconnect();
      root.removeProperty(COOKIE_BANNER_HEIGHT_VAR);
    };
  }, [shouldShow]);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    setShouldShow(false);
  };

  // Don't render anything until we know if we should show (avoid hydration mismatch)
  if (shouldShow === null || !shouldShow) {
    return null;
  }

  return (
    <div
      ref={bannerRef}
      className="border-border bg-background/95 supports-backdrop-filter:bg-background/80 fixed right-0 bottom-0 left-0 z-50 border-t shadow-lg backdrop-blur">
      <div className="container mx-auto px-4 py-2.5 sm:py-3">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-muted-foreground flex-1 text-xs leading-relaxed sm:text-sm">
            We use cookies to keep you signed in and to show dates in your time
            zone. By using Invoice Forge, you agree to their use as outlined in
            our{' '}
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
