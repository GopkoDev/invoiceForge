'use client';

import { useRouter } from 'next/navigation';
import { protectedRoutes } from '@/config/routes.config';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { InvoiceEditorData } from '@/types/invoice/types';
import type { InvoiceEditorInitData } from './types';
import { createInvoiceEditorStore, type InvoiceEditorStoreApi } from './create-invoice-editor-store';
import { InvoiceEditorStoreContext } from './selectors';

// editor-ux T38/T49: once a new invoice is created, its editor moves to /invoices/<id>/edit, a
// different route segment that mounts a second provider. Building that one's store from the server
// row would drop what the Freelancer typed meanwhile, so the live store is handed over instead: one
// entry, for one Freelancer and one invoice, adopted by the provider that mounts for exactly that
// pair. The edit page's editor is new DOM, so the entry also carries the focused field and its caret.
interface Handoff {
  store: InvoiceEditorStoreApi;
  claimed: boolean;
  focus: FocusSnapshot | null;
}
const handoffs = new Map<string, Handoff>();
const handoffKey = (ownerId: string, invoiceId: string) => `${ownerId}:${invoiceId}`;
// A store moves the router to its edit page once, however often the offer effect re-runs.
const moved = new WeakSet<InvoiceEditorStoreApi>();

/** The focused field, by what names it on screen, and its caret / selection. */
interface FocusSnapshot {
  tag: string;
  attr: string;
  value: string;
  selection: [number, number, 'forward' | 'backward' | 'none'] | null;
}
const NAMING_ATTRS = ['aria-label', 'name', 'id', 'placeholder'] as const;

function captureFocus(): FocusSnapshot | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || el === document.body) return null;
  const attr = NAMING_ATTRS.find((a) => el.getAttribute(a));
  if (!attr) return null;
  const field = el as Partial<HTMLInputElement>;
  const selection =
    typeof field.selectionStart === 'number' && typeof field.selectionEnd === 'number'
      ? ([field.selectionStart, field.selectionEnd, field.selectionDirection ?? 'none'] as FocusSnapshot['selection'])
      : null;
  return { tag: el.tagName, attr, value: el.getAttribute(attr)!, selection };
}

function restoreFocus(snapshot: FocusSnapshot): void {
  // Something the Freelancer focused since keeps the focus.
  if (document.activeElement && document.activeElement !== document.body) return;
  const matches = [...document.querySelectorAll<HTMLElement>(snapshot.tag)].filter(
    (el) => el.getAttribute(snapshot.attr) === snapshot.value
  );
  const target = matches.find((el) => el.getClientRects().length > 0) ?? matches[0];
  if (!target) return;
  target.focus({ preventScroll: true });
  if (snapshot.selection) {
    try {
      (target as HTMLInputElement).setSelectionRange(...snapshot.selection);
    } catch {
      // A field without a text caret (e.g. type="number") keeps just the focus.
    }
  }
}

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
  const router = useRouter();

  // Adopting claims the entry before the previous provider's cleanup runs (layout effects of a
  // commit precede its passive cleanups), so that cleanup knows the store lives on. The old editor's
  // DOM is gone by now and this one's is in place: the focus goes back where it was.
  useLayoutEffect(() => {
    if (!adoptedKey) return;
    const entry = handoffs.get(adoptedKey);
    if (!entry || entry.store !== store) return;
    entry.claimed = true;
    if (entry.focus) restoreFocus(entry.focus);
    entry.focus = null;
  }, [adoptedKey, store]);

  // A store on offer is leaving with this editor's DOM: note where the focus is first. A layout
  // cleanup runs before React removes the editor's nodes, and in the same commit as the adopter's
  // layout effect, so no key press can fall between the two.
  useLayoutEffect(
    () => () => {
      for (const entry of handoffs.values()) {
        if (entry.store === store && !entry.claimed) entry.focus = captureFocus();
      }
    },
    [store]
  );

  // A new invoice that was just created offers its live store to the edit page of the same id and
  // moves the router there. The decision is this provider's own: it started as new and its store
  // now has an id; the address (rewritten by the save) plays no part.
  useEffect(() => {
    if (!ownerId || !startedAsNew) return;
    let key: string | null = null;
    const offer = () => {
      const id = store.getState().invoiceId;
      if (id && !key) {
        key = handoffKey(ownerId, id);
        handoffs.set(key, { store, claimed: false, focus: null });
        if (!moved.has(store)) {
          moved.add(store);
          // Out of the store update that announced the id; the scroll position stays where it is.
          queueMicrotask(() => router.replace(protectedRoutes.invoiceEdit(id), { scroll: false }));
        }
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
  // another page. A store the edit page adopted is not ours to dispose any more. StrictMode's
  // mount, cleanup, mount runs this cleanup without leaving: the second mount resumes the store,
  // so a save in flight (an adopted store can bring one) still lands and clears isSaving.
  const disposedHere = useRef(false);
  useEffect(() => {
    if (disposedHere.current) {
      disposedHere.current = false;
      store.getState().resume();
    }
    return () => {
      if (adoptedKey) handoffs.delete(adoptedKey);
      // The offer effect's cleanup already removed an unclaimed entry, so one still here was claimed.
      else if ([...handoffs.values()].some((entry) => entry.store === store)) return;
      store.getState().dispose();
      disposedHere.current = true;
    };
  }, [store, adoptedKey]);
  // A new invoice that opened with a sender asks for its number hint once; the store ignores repeats.
  useEffect(() => {
    void store.getState().requestNumberHint();
  }, [store]);
  return <InvoiceEditorStoreContext.Provider value={store}>{children}</InvoiceEditorStoreContext.Provider>;
}
