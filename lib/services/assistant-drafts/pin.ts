// ai-chat-v2 T10 (ADR-0003; server-actions.md §Chat route internals, Pins): a pressed option is written into the
// stored draft request as the exact record, so the next resolution cannot pick a look-alike (AC-10). Pure.
import 'server-only';
import type { ChoiceOfferKind } from '@/types/assistant/types';
import type { DraftRequest } from '@/lib/services/assistant-drafts/schema';
import type { OfferOptionRef } from '@/lib/services/assistant-drafts/offers';

function refValue(ref: OfferOptionRef, key: string): string {
  const value = (ref as Record<string, unknown>)[key];
  if (typeof value !== 'string') throw new Error(`A ${key} option was expected.`);
  return value;
}

/** The request with the chosen record pinned; the input is never changed. */
export function pinChoice(
  request: DraftRequest,
  kind: ChoiceOfferKind,
  lineIndex: number | null,
  ref: OfferOptionRef
): DraftRequest {
  switch (kind) {
    case 'CUSTOMER': {
      const pinned: DraftRequest = { ...request, customerId: refValue(ref, 'customerId') };
      delete pinned.customer;
      return pinned;
    }
    case 'SENDER_PROFILE': {
      const pinned: DraftRequest = { ...request, senderProfileId: refValue(ref, 'senderProfileId') };
      delete pinned.senderProfile;
      return pinned;
    }
    case 'CURRENCY':
      return { ...request, currency: refValue(ref, 'currency') };
    case 'BANK_ACCOUNT':
      return { ...request, bankAccount: refValue(ref, 'bankAccountId') };
    case 'PRODUCT': {
      if (lineIndex === null || lineIndex < 0 || lineIndex >= request.lines.length) {
        throw new Error('A product option needs the index of an existing line.');
      }
      const productId = refValue(ref, 'productId');
      return { ...request, lines: request.lines.map((l, i) => (i === lineIndex ? { ...l, productId } : l)) };
    }
  }
}
