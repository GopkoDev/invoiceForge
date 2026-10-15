'use client';

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

import type { DraftCardView, LinkedInvoiceState } from '@/types/assistant/types';

type Apply = (invoiceId: string, state: LinkedInvoiceState) => void;
type ApplyForCard = (cardId: string, state: LinkedInvoiceState) => void;

type Store = {
  /** Invoice states by invoice id. */
  invoices: Record<string, LinkedInvoiceState>;
  /** Which invoice a created card made, so a card-scoped result (UNAVAILABLE has no id) reaches its links too. */
  cardInvoices: Record<string, string>;
  /** The last state learned for a card (a preview load or an issue result). */
  cards: Record<string, LinkedInvoiceState>;
};

type Writers = {
  apply: Apply;
  applyForCard: ApplyForCard;
  seed: (invoices: Record<string, LinkedInvoiceState>, cardInvoices: Record<string, string>) => void;
};

const EMPTY: Store = { invoices: {}, cardInvoices: {}, cards: {} };
const StoreContext = createContext<Store | null>(null);
const WritersContext = createContext<Writers | null>(null);

/**
 * ai-chat-v2 T23 (ADR-0008; sad.md §8 "Client state"): the workspace's one invoice-state store. Every place that
 * learns a state (the page load, createDraftFromCard, loadInvoicePreview, issueFromPreview) writes it here, and the
 * Draft card, every ChatLink and the preview panel read it, so they always agree. Nothing navigates or polls.
 * Under an outer provider an inner one passes through, so the workspace and the island share one store.
 */
export function InvoiceStateProvider({ children }: { children: ReactNode }) {
  const outer = useContext(WritersContext);
  if (outer) return <>{children}</>;
  return <InvoiceStateStore>{children}</InvoiceStateStore>;
}

function InvoiceStateStore({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(EMPTY);
  const apply = useCallback<Apply>((invoiceId, state) => {
    setStore((s) => (s.invoices[invoiceId] === state ? s : { ...s, invoices: { ...s.invoices, [invoiceId]: state } }));
  }, []);
  const applyForCard = useCallback<ApplyForCard>((cardId, state) => {
    setStore((s) => {
      const invoiceId = state.state === 'UNAVAILABLE' ? s.cardInvoices[cardId] : state.invoiceId;
      return {
        invoices: invoiceId ? { ...s.invoices, [invoiceId]: state } : s.invoices,
        cardInvoices:
          state.state === 'UNAVAILABLE' ? s.cardInvoices : { ...s.cardInvoices, [cardId]: state.invoiceId },
        cards: { ...s.cards, [cardId]: state },
      };
    });
  }, []);
  const seed = useCallback<Writers['seed']>((invoices, cardInvoices) => {
    if (Object.keys(invoices).length === 0 && Object.keys(cardInvoices).length === 0) return;
    setStore((s) => ({
      invoices: { ...s.invoices, ...invoices },
      cardInvoices: { ...s.cardInvoices, ...cardInvoices },
      cards: s.cards,
    }));
  }, []);
  const writers = useMemo(() => ({ apply, applyForCard, seed }), [apply, applyForCard, seed]);
  return (
    <WritersContext.Provider value={writers}>
      <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
    </WritersContext.Provider>
  );
}

/** The stored state of an invoice, or undefined when nothing has written one (or outside a provider). */
export function useInvoiceState(invoiceId: string | null | undefined): LinkedInvoiceState | undefined {
  const store = useContext(StoreContext);
  return invoiceId ? store?.invoices[invoiceId] : undefined;
}

/**
 * The stored state of a created card's invoice: its invoice's state when the card's invoice is known, else the
 * last card-scoped result (a preview that found the invoice gone).
 */
export function useCardInvoiceState(cardId: string, invoiceId: string | null): LinkedInvoiceState | undefined {
  const store = useContext(StoreContext);
  if (!store) return undefined;
  const cardState = store.cards[cardId];
  if (cardState?.state === 'UNAVAILABLE') return cardState;
  const id = invoiceId ?? store.cardInvoices[cardId];
  return (id ? store.invoices[id] : undefined) ?? cardState;
}

const noop = () => undefined;

/** Writes one invoice's state (an action result). A no-op outside a provider. */
export function useApplyInvoiceState(): Apply {
  return useContext(WritersContext)?.apply ?? noop;
}

/** Writes a card's invoice state (a preview or issue result for that card). A no-op outside a provider. */
export function useApplyCardInvoiceState(): ApplyForCard {
  return useContext(WritersContext)?.applyForCard ?? noop;
}

/** The invoice states a page load carries: its links' states and every created card's invoice. */
export function loadedInvoiceStates(
  invoiceLinks: Record<string, LinkedInvoiceState>,
  cards: Record<string, DraftCardView>
): Record<string, LinkedInvoiceState> {
  const states: Record<string, LinkedInvoiceState> = {};
  for (const card of Object.values(cards)) {
    if (card.invoice && card.invoice.state !== 'UNAVAILABLE') states[card.invoice.invoiceId] = card.invoice;
  }
  return { ...states, ...invoiceLinks };
}

function cardInvoiceIds(cards: Record<string, DraftCardView>): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const card of Object.values(cards)) {
    if (card.invoice && card.invoice.state !== 'UNAVAILABLE') ids[card.id] = card.invoice.invoiceId;
  }
  return ids;
}

/** Seeds the store from a page load (on mount and whenever a refresh or a read brings new states). */
export function useSeedInvoiceStates(
  invoiceLinks: Record<string, LinkedInvoiceState>,
  cards: Record<string, DraftCardView>
): void {
  const seed = useContext(WritersContext)?.seed;
  useLayoutEffect(() => {
    seed?.(loadedInvoiceStates(invoiceLinks, cards), cardInvoiceIds(cards));
  }, [seed, invoiceLinks, cards]);
}

/** Records which invoice a card made (a card rendered outside a page load, or created just now). */
export function useRegisterCardInvoice(cardId: string, invoiceId: string | null): void {
  const seed = useContext(WritersContext)?.seed;
  useLayoutEffect(() => {
    if (invoiceId) seed?.({}, { [cardId]: invoiceId });
  }, [seed, cardId, invoiceId]);
}
