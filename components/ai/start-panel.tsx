'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

import { AllowanceNotice } from '@/components/ai/allowance-notice';
import { Composer } from '@/components/ai/composer';
import { Button, buttonVariants } from '@/components/ui/button';
import { protectedRoutes } from '@/config/routes.config';
import type { AllowanceState } from '@/lib/validations/assistant-chat';

// ai-chat-v2 T20 (screens.md §SCR-02; spec §1): the fixed suggested requests, incl. drafting and who owes money.
const SUGGESTIONS = [
  'Invoice Acme for 20 hours of consulting at $50',
  'Who owes me money right now?',
  "What's overdue today?",
  'Which bank accounts do I have?',
];
const GREETING = 'Hi! What can I help you with?';
const SUBLINE = 'Ask about your invoices, Customers and payments, or describe an invoice to draft.';
const DRAFT_GREETING = 'Draft an invoice';
const DRAFT_SUBLINE = "Describe it in one sentence. You'll see a card to check before anything is created.";
const DRAFT_EXAMPLE = SUGGESTIONS[0];

/**
 * SCR-02, the empty state of a new Conversation (AC-18): a greeting, a centred max-2xl composer with the counter
 * under it, and the suggested requests, centred in the chat pane. A suggestion only fills and focuses the box.
 * Nothing is saved until the first message; ChatIsland owns `onSend` and moves the composer down on it.
 */
export function StartPanel({
  state,
  start,
  onSend,
  usedUpMessage,
}: {
  state: AllowanceState;
  start?: 'draft';
  onSend: (text: string) => void;
  /** A 429's `error` on the first send (SCR-02 "used-up on send"), shown verbatim. */
  usedUpMessage?: string;
}) {
  const [text, setText] = useState('');
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const isDraft = start === 'draft';
  const suggestions = isDraft ? [DRAFT_EXAMPLE] : SUGGESTIONS;

  function pick(suggestion: string) {
    setText(suggestion);
    boxRef.current?.focus();
  }

  return (
    <div data-slot="start-panel" className="flex min-h-full flex-1 flex-col items-center justify-center gap-6 px-2 py-8">
      <div className="flex max-w-2xl flex-col items-center gap-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">{isDraft ? DRAFT_GREETING : GREETING}</h2>
        <p className="text-muted-foreground text-sm">{isDraft ? DRAFT_SUBLINE : SUBLINE}</p>
      </div>
      {state.left === 0 ? (
        <div className="w-full max-w-2xl">
          <AllowanceNotice state={state} usedUpMessage={usedUpMessage} handMadeLink={isDraft} />
        </div>
      ) : (
        <>
          <div data-slot="start-composer" className="w-full max-w-2xl">
            <Composer
              value={text}
              onChange={setText}
              onSend={onSend}
              allowance={state}
              busy={false}
              placeholder={isDraft ? `e.g. "${DRAFT_EXAMPLE}"` : undefined}
              inputRef={boxRef}
              autoFocus={isDraft}
            />
          </div>
          <div className="flex w-full max-w-2xl flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <Button key={suggestion} type="button" variant="outline" size="sm" onClick={() => pick(suggestion)}>
                {suggestion}
              </Button>
            ))}
          </div>
          {/* Kept from the parent start panel (ai-assistant AC-01): the Personal-key alternative. */}
          <Link href={protectedRoutes.settingsAssistants} className={buttonVariants({ variant: 'link', size: 'sm' })}>
            Connect your own AI client →
          </Link>
        </>
      )}
    </div>
  );
}
