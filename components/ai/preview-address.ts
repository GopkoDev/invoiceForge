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

/** Opens a card's preview with a new history entry, so Back closes it (ADR-0005). */
export function openPreview(cardId: string): void {
  const state: unknown = window.history.state;
  const entry = state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
  window.history.pushState({ ...entry, [PREVIEW_ENTRY]: cardId }, '', addressWith(cardId));
}

/** Closes the preview: steps Back when the entry is the one openPreview pushed, else drops the parameter in place. */
export function closePreview(): void {
  const state: unknown = window.history.state;
  if (state && typeof state === 'object' && PREVIEW_ENTRY in state) {
    window.history.back();
    return;
  }
  window.history.replaceState(window.history.state, '', addressWith(null));
}
