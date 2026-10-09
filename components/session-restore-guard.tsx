'use client';

import { useEffect } from 'react';

// AC-07 / ADR-0007: a page restored from the back/forward cache is hidden and reloaded before it
// can show a previous Freelancer's data.
function hideAndReload(event: PageTransitionEvent) {
  if (!event.persisted) return;
  document.documentElement.style.visibility = 'hidden';
  window.location.reload();
}

// Runs from the server-rendered HTML, so the listener exists before React hydrates (the CSP
// allows inline scripts). A page the browser restores skips hydration entirely.
const EARLY_GUARD = `addEventListener('pageshow',function(e){if(e.persisted){document.documentElement.style.visibility='hidden';location.reload();}});`;

export function SessionRestoreGuard() {
  useEffect(() => {
    window.addEventListener('pageshow', hideAndReload);
    return () => window.removeEventListener('pageshow', hideAndReload);
  }, []);

  return <script dangerouslySetInnerHTML={{ __html: EARLY_GUARD }} />;
}
