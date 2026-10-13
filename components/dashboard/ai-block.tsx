'use client';

import { SparklesIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { HANDOFF_PARAM, writeHandoff } from '@/components/ai/ai-handoff';
import { AllowanceNotice } from '@/components/ai/allowance-notice';
import { MESSAGE_MAX_LENGTH, TOO_LONG_MESSAGE } from '@/components/ai/composer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError } from '@/components/ui/field';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { buttonVariants } from '@/components/ui/button';
import { protectedRoutes } from '@/config/routes.config';
import { cn } from '@/lib/utils';
import type { AllowanceState } from '@/lib/validations/assistant-chat';
import type { ConversationSummary } from '@/types/assistant/types';

const EMPTY_PROMPT = 'Type a message first.';
const NONE_YET = 'No conversations yet. Your chats with AI will show here.';

function withThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function lastMessageDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(
    new Date(iso)
  );
}

/**
 * ai-chat-v2 T26 (screens.md §SCR-09; AC-29–AC-32): the dashboard's "Ask AI" card. Left, the prompt box (or the
 * used-up notice with the hand-made link); right, the latest three Conversations and "All conversations →".
 * Rendered by the dashboard's AiBlockSection, which reads the allowance and the latest Conversations.
 */
export function DashboardAiBlock({
  allowance,
  latest,
  timeZone,
}: {
  allowance: AllowanceState;
  latest: ConversationSummary[];
  timeZone: string;
}) {
  return (
    <div className="px-4 lg:px-6">
      <Card data-slot="dashboard-ai-block">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SparklesIcon aria-hidden className="size-4" />
            Ask AI
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="flex min-w-0 flex-col gap-2">
            {allowance.left === 0 ? (
              <AllowanceNotice state={allowance} handMadeLink />
            ) : (
              <DashboardPromptBox allowance={allowance} />
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm font-medium">Recent conversations</p>
            {latest.length === 0 ? (
              <p className="text-muted-foreground text-sm">{NONE_YET}</p>
            ) : (
              <ul aria-label="Recent conversations" className="flex flex-col gap-1">
                {latest.map((c) => (
                  <li key={c.id}>
                    <Item size="sm" variant="outline" render={<Link href={protectedRoutes.aiConversation(c.id)} />}>
                      <ItemContent className="min-w-0">
                        <ItemTitle className="block w-full truncate" title={c.title}>
                          {c.title}
                        </ItemTitle>
                        <ItemDescription>{lastMessageDay(c.lastMessageAt, timeZone)}</ItemDescription>
                      </ItemContent>
                    </Item>
                  </li>
                ))}
              </ul>
            )}
            <Link href={protectedRoutes.ai} className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'self-start px-0')}>
              All conversations →
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The prompt box (ADR-0009): a valid prompt is stored under a one-time sessionStorage id and the AI section opens
 * with only that id in the address; the island sends it with origin DASHBOARD. Validated by the chat message rule.
 */
function DashboardPromptBox({ allowance }: { allowance: AllowanceState }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [emptyTried, setEmptyTried] = useState(false);
  const [sending, setSending] = useState(false);
  const trimmed = value.trim();
  const tooLong = trimmed.length > MESSAGE_MAX_LENGTH;
  const error = tooLong ? TOO_LONG_MESSAGE : emptyTried && !trimmed ? EMPTY_PROMPT : undefined;

  function send() {
    if (sending) return;
    if (!trimmed) {
      setEmptyTried(true);
      return;
    }
    if (tooLong) return;
    setSending(true);
    const id = writeHandoff(trimmed);
    // Storage blocked: a plain new Conversation; nothing is sent (sad.md §11).
    router.push(id ? `${protectedRoutes.ai}?${HANDOFF_PARAM}=${id}` : protectedRoutes.ai);
  }

  // ai-chat-v2 T39 (ADR-0010, SCR-09): the same PromptInput card as the chat; Enter sends and Shift+Enter is a newline
  // (the element), an empty or too-long prompt shows its FieldError and sends nothing (send()).
  return (
    <Field data-invalid={error ? true : undefined}>
      <PromptInput onSubmit={send}>
        <PromptInputBody>
          <PromptInputTextarea
            aria-label="Message to AI"
            placeholder="Ask about your invoices or describe one to draft"
            className="min-h-16"
            value={value}
            readOnly={sending}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setValue(event.target.value);
              setEmptyTried(false);
            }}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools className="flex-col items-start gap-1 [&_p]:text-xs">
            {error ? (
              <FieldError className="text-xs">
                <span>{error}</span>
                {tooLong ? (
                  <span className="ml-2">{`${withThousands(trimmed.length)} / ${withThousands(MESSAGE_MAX_LENGTH)}`}</span>
                ) : null}
              </FieldError>
            ) : null}
            <AllowanceNotice state={allowance} />
          </PromptInputTools>
          <PromptInputSubmit aria-label="Send to AI" status={sending ? 'submitted' : 'ready'} disabled={tooLong} />
        </PromptInputFooter>
      </PromptInput>
    </Field>
  );
}
