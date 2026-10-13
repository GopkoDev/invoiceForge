'use client';

import {
  ClockIcon,
  HandCoinsIcon,
  LandmarkIcon,
  PenLineIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { ConversationEmptyState } from '@/components/ai-elements/conversation';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { AllowanceNotice } from '@/components/ai/allowance-notice';
import { Composer } from '@/components/ai/composer';
import { buttonVariants } from '@/components/ui/button';
import { protectedRoutes } from '@/config/routes.config';
import type { AllowanceState } from '@/lib/validations/assistant-chat';
import { cn } from '@/lib/utils';

// ai-chat-v2 T20 (screens.md §SCR-02; spec §1): the fixed suggested requests, incl. drafting and who owes money.
const SUGGESTIONS: { text: string; icon: LucideIcon }[] = [
  { text: 'Invoice Acme for 20 hours of consulting at $50', icon: PenLineIcon },
  { text: 'Who owes me money right now?', icon: HandCoinsIcon },
  { text: "What's overdue today?", icon: ClockIcon },
  { text: 'Which bank accounts do I have?', icon: LandmarkIcon },
];
const DRAFT_SUBLINE =
  "Describe it in one sentence. You'll see a card to check before anything is created.";
const DRAFT_EXAMPLE = SUGGESTIONS[0].text;

/**
 * SCR-02, the empty state of a new Conversation (AC-18; presentation per ai-chat-v2 T37, ADR-0010): a two-line greeting
 * (line 1 from the server: time of day and first name; line 2 with the accent span), a centred PromptInput card with
 * the counter in its footer, and the suggested requests as chips under it, centred both ways in the chat pane. A
 * suggestion only fills and focuses the box. Nothing is saved until the first message; ChatIsland owns `onSend` and
 * moves the composer down on it.
 */
export function StartPanel({
  greeting,
  state,
  start,
  onSend,
  usedUpMessage,
}: {
  /** Line 1, e.g. "Good morning, Dmytro", computed on the server in the Freelancer time zone. */
  greeting: string;
  state: AllowanceState;
  start?: 'draft';
  onSend: (text: string) => void;
  /** A 429's `error` on the first send (SCR-02 "used-up on send"), shown verbatim. */
  usedUpMessage?: string;
}) {
  const [text, setText] = useState('');
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const isDraft = start === 'draft';
  const suggestions = isDraft ? SUGGESTIONS.slice(0, 1) : SUGGESTIONS;

  function pick(suggestion: string) {
    setText(suggestion);
    boxRef.current?.focus();
  }

  return (
    <ConversationEmptyState
      data-slot="start-panel"
      className="min-h-full flex-1 gap-6 px-4 py-8 md:gap-8"
    >
      <div className="flex w-full max-w-3xl flex-col items-center gap-3">
        <h1 className="text-2xl font-medium tracking-tight text-balance md:text-3xl">
          <span className="block">{greeting}</span>{' '}
          <span className="block">
            {isDraft ? "Let's draft " : 'How can I help with '}
            <span data-slot="greeting-accent" className="ai-greeting-accent">
              {isDraft ? 'an invoice.' : 'your invoices today?'}
            </span>
          </span>
        </h1>
        {isDraft ? (
          <p className="text-muted-foreground text-sm">{DRAFT_SUBLINE}</p>
        ) : null}
      </div>
      {state.left === 0 ? (
        <div className="w-full max-w-3xl text-left">
          <AllowanceNotice
            state={state}
            usedUpMessage={usedUpMessage}
            handMadeLink={isDraft}
          />
        </div>
      ) : (
        <div className="flex w-full max-w-3xl flex-col gap-3 text-left">
          <div data-slot="start-composer">
            <Composer
              value={text}
              onChange={setText}
              onSend={onSend}
              allowance={state}
              busy={false}
              placeholder={isDraft ? `e.g. "${DRAFT_EXAMPLE}"` : undefined}
              inputRef={boxRef}
              autoFocus={isDraft}
              textareaClassName="min-h-20"
            />
          </div>
          <Suggestions>
            {suggestions.map(({ text: suggestion, icon: Icon }) => (
              <Suggestion
                key={suggestion}
                suggestion={suggestion}
                onClick={pick}
              >
                <Icon aria-hidden className="text-muted-foreground" />
                {suggestion}
              </Suggestion>
            ))}
          </Suggestions>
          {/* Kept from the parent start panel (ai-assistant AC-01): the Personal-key alternative. */}
          <Link
            href={protectedRoutes.settingsAssistants}
            className={cn(
              buttonVariants({ variant: 'link', size: 'sm' }),
              'text-muted-foreground self-start px-0'
            )}
          >
            Connect your own AI client →
          </Link>
        </div>
      )}
    </ConversationEmptyState>
  );
}
