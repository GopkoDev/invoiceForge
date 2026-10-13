'use client';

import { CheckIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import type { ChoiceOfferKind, OfferView } from '@/types/assistant/types';

const GROUP_LABEL: Record<ChoiceOfferKind, string> = {
  CUSTOMER: 'Choose a Customer',
  BANK_ACCOUNT: 'Choose a bank account',
  PRODUCT: 'Choose a product',
  SENDER_PROFILE: 'Choose a sender profile',
  CURRENCY: 'Choose a currency',
};

/**
 * ai-chat-v2 T22 (screens.md §SCR-04; AC-08, AC-10, AC-12, AC-13): a reply's Offered choices. Labels are the
 * server's stored ones, shown verbatim (the UI never builds or edits one). Pressable only while the offer is OPEN
 * and its reply is the latest; the chosen option is marked from the stored state, never optimistically.
 */
export function OfferedChoices({
  offer,
  isLatest,
  pendingOptionId,
  onPress,
}: {
  /** undefined while the labels are loading (the part streamed with its id only). */
  offer: OfferView | undefined;
  isLatest: boolean;
  /** The option being pressed right now: it shows a spinner and the group is locked. */
  pendingOptionId: number | null;
  onPress: (offerId: string, optionId: number, label: string) => void;
}) {
  if (!offer) {
    return (
      <div data-slot="offered-choices" aria-busy="true" className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
      </div>
    );
  }

  const pressable = offer.state === 'OPEN' && isLatest && pendingOptionId === null;
  return (
    <div
      data-slot="offered-choices"
      data-state={offer.state}
      role="group"
      aria-label={GROUP_LABEL[offer.kind]}
      className="flex flex-wrap gap-2"
    >
      {offer.options.map((option) => {
        const chosen = offer.state === 'CHOSEN' && offer.chosenOptionId === option.optionId;
        const variant = chosen ? 'secondary' : 'outline';
        return (
          <Button
            key={option.optionId}
            type="button"
            size="sm"
            variant={variant}
            data-variant={variant}
            title={option.label}
            // The accessible name keeps the space the sr-only suffix loses in name computation.
            aria-label={chosen ? `${option.label} (chosen)` : undefined}
            disabled={!pressable}
            className="max-w-full"
            onClick={() => onPress(offer.offerId, option.optionId, option.label)}
          >
            {pendingOptionId === option.optionId ? <Spinner aria-hidden role="presentation" /> : null}
            {chosen ? <CheckIcon aria-hidden /> : null}
            <span className="truncate">{option.label}</span>
            {chosen ? <span className="sr-only"> (chosen)</span> : null}
          </Button>
        );
      })}
    </div>
  );
}
