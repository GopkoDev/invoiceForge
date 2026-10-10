'use client';

import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { protectedRoutes } from '@/config/routes.config';
import { useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import type { InvoiceEditorData } from '@/types/invoice/types';
import type { InvoiceEditorInitData } from './types';
import { createInvoiceEditorStore, type InvoiceEditorStoreApi } from './create-invoice-editor-store';
import { InvoiceEditorStoreContext } from './selectors';

// editor-ux T38: after a create, the address becomes /invoices/<id>/edit and the next Save's refresh
// renders that page, which mounts a second provider. Building its store from the server row would
// drop what the Freelancer typed meanwhile, so the live store is handed over instead: one entry,
// for one Freelancer and one invoice, adopted by the provider that mounts for exactly that pair.
interface Handoff {
  store: InvoiceEditorStoreApi;
  claimed: boolean;
}
const handoffs = new Map<string, Handoff>();
const handoffKey = (ownerId: string, invoiceId: string) => `${ownerId}:${invoiceId}`;

/**
 * Creates the editor's store once per mount, from the server's data (ADR-0003). Pages pass
 * key={`${freelancerId}:${invoiceId ?? 'new'}`} and ownerId={freelancerId} so React discards the
 * store when the invoice or the account changes, and a just-created invoice's live store can move
 * to its edit page.
 */
export function InvoiceEditorProvider({
  initial,
  ownerId,
  children,
}: {
  initial: InvoiceEditorInitData | InvoiceEditorData;
  ownerId?: string;
  children: ReactNode;
}) {
  const [{ store, adoptedKey }] = useState(() => {
    const id = initial.invoiceId;
    if (ownerId && id) {
      const entry = handoffs.get(handoffKey(ownerId, id));
      if (entry && entry.store.getState().invoiceId === id) {
        return { store: entry.store, adoptedKey: handoffKey(ownerId, id) };
      }
    }
    return { store: createInvoiceEditorStore(initial), adoptedKey: null };
  });
  const startedAsNew = !initial.invoiceId;
  // The context, not useRouter(): outside an app router (component tests) there is simply no router to move.
  const router = useContext(AppRouterContext);

  // Adopting claims the entry before the previous provider's cleanup runs (layout effects of a
  // commit precede its passive cleanups), so that cleanup knows the store lives on.
  useLayoutEffect(() => {
    if (!adoptedKey) return;
    const entry = handoffs.get(adoptedKey);
    if (entry && entry.store === store) entry.claimed = true;
  }, [adoptedKey, store]);

  // A new invoice that was just created offers its live store to the edit page of the same id.
  useEffect(() => {
    if (!ownerId || !startedAsNew) return;
    let key: string | null = null;
    const offer = () => {
      const id = store.getState().invoiceId;
      if (id && !key) {
        key = handoffKey(ownerId, id);
        handoffs.set(key, { store, claimed: false });
        // Move Next's router to the edit page now, while the create is the only thing that ran: the
        // page swap happens here, with the live store handed over, and not during a later Save.
        const onNewPage = typeof window !== 'undefined' && window.location.pathname === protectedRoutes.invoicesNew;
        const target = protectedRoutes.invoiceEdit(id);
        if (onNewPage && router) queueMicrotask(() => router.replace(target));
      }
    };
    offer();
    const unsubscribe = store.subscribe(offer);
    return () => {
      unsubscribe();
      // Left without the edit page taking it: the offer ends here, never to be adopted later.
      if (key && handoffs.get(key)?.store === store && !handoffs.get(key)?.claimed) handoffs.delete(key);
    };
  }, [store, ownerId, startedAsNew, router]);

  // Leaving the editor disposes its store, so a Retry or a create finishing later cannot act on
  // another page. The cleanup is all there is to arm: dispose() only invalidates what started
  // before it, so StrictMode's mount, cleanup, mount leaves the store working for new saves. A store
  // the edit page adopted is not ours to dispose any more.
  useEffect(
    () => () => {
      if (adoptedKey) handoffs.delete(adoptedKey);
      // The offer effect's cleanup already removed an unclaimed entry, so one still here was claimed.
      else if ([...handoffs.values()].some((entry) => entry.store === store)) return;
      store.getState().dispose();
    },
    [store, adoptedKey]
  );
  // A new invoice that opened with a sender asks for its number hint once; the store ignores repeats.
  useEffect(() => {
    void store.getState().requestNumberHint();
  }, [store]);
  return <InvoiceEditorStoreContext.Provider value={store}>{children}</InvoiceEditorStoreContext.Provider>;
}
