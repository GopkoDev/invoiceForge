'use client';

/** ADR-0005: an open invoice preview is `?preview={cardId}` on the Conversation's address. */
export const PREVIEW_PARAM = 'preview';

const PREVIEW_ENTRY = 'aiPreview';

function addressWith(cardId: string | null): string {
  const url = new URL(window.location.href);
  if (cardId) url.searchParams.set(PREVIEW_PARAM, cardId);
  else url.searchParams.delete(PREVIEW_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The AI section's own keys of the current entry, without the App Router's (`__NA`, its tree). The router patches
 * pushState / replaceState so usePathname and useSearchParams follow an outside write, but only for a state that
 * does not carry its `__NA` marker; it then copies its own keys in itself. Handing it `window.history.state` as is
 * made it miss the new address and later write its stale one back (ai-chat-v2 T31 finding).
 */
function ownState(): Record<string, unknown> {
  const state: unknown = window.history.state;
  const entry = state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
  return PREVIEW_ENTRY in entry ? { [PREVIEW_ENTRY]: entry[PREVIEW_ENTRY] } : {};
}

/** Swaps the address in place (no new entry, no navigation), visible to usePathname / useSearchParams. */
export function replaceAddress(address: string): void {
  window.history.replaceState(ownState(), '', address);
}

/** Opens a card's preview with a new history entry, so Back closes it (ADR-0005). */
export function openPreview(cardId: string): void {
  window.history.pushState({ [PREVIEW_ENTRY]: cardId }, '', addressWith(cardId));
}

/** Closes the preview: steps Back when the entry is the one openPreview pushed, else drops the parameter in place. */
export function closePreview(): void {
  const state: unknown = window.history.state;
  if (state && typeof state === 'object' && PREVIEW_ENTRY in state) {
    window.history.back();
    return;
  }
  replaceAddress(addressWith(null));
}
