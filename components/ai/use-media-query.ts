'use client';

import { useSyncExternalStore } from 'react';

/** True while the media query matches; `serverValue` before hydration and where matchMedia is missing. */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = typeof window !== 'undefined' ? window.matchMedia?.(query) : undefined;
      if (!list) return () => undefined;
      list.addEventListener?.('change', onChange);
      return () => list.removeEventListener?.('change', onChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : serverValue),
    () => serverValue
  );
}
