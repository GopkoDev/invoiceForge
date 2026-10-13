'use client';

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

import type { DraftCardView, LinkedInvoiceState } from '@/types/assistant/types';

type Apply = (invoiceId: string, state: LinkedInvoiceState) => void;
type ApplyMany = (states: Record<string, LinkedInvoiceState>) => void;

const StatesContext = createContext<Record<string, LinkedInvoiceState> | null>(null);
const WritersContext = createContext<{ apply: Apply; applyMany: ApplyMany } | null>(null);

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
  const [states, setStates] = useState<Record<string, LinkedInvoiceState>>({});
  const apply = useCallback<Apply>((invoiceId, state) => {
    setStates((current) => (current[invoiceId] === state ? current : { ...current, [invoiceId]: state }));
  }, []);
  const applyMany = useCallback<ApplyMany>((next) => {
    if (Object.keys(next).length === 0) return;
    setStates((current) => ({ ...current, ...next }));
  }, []);
  const writers = useMemo(() => ({ apply, applyMany }), [apply, applyMany]);
  return (
    <WritersContext.Provider value={writers}>
      <StatesContext.Provider value={states}>{children}</StatesContext.Provider>
    </WritersContext.Provider>
  );
}

/** The stored state of an invoice, or undefined when nothing has written one (or outside a provider). */
export function useInvoiceState(invoiceId: string | null | undefined): LinkedInvoiceState | undefined {
  const states = useContext(StatesContext);
  return invoiceId ? states?.[invoiceId] : undefined;
}

const noop: Apply = () => undefined;

/** Writes one invoice's state (an action result). A no-op outside a provider. */
export function useApplyInvoiceState(): Apply {
  return useContext(WritersContext)?.apply ?? noop;
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

/** Seeds the store from a page load (on mount and whenever a refresh or a read brings new states). */
export function useSeedInvoiceStates(
  invoiceLinks: Record<string, LinkedInvoiceState>,
  cards: Record<string, DraftCardView>
): void {
  const applyMany = useContext(WritersContext)?.applyMany;
  useLayoutEffect(() => {
    applyMany?.(loadedInvoiceStates(invoiceLinks, cards));
  }, [applyMany, invoiceLinks, cards]);
}
