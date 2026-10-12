'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

import { AllowanceNotice } from '@/components/ai/allowance-notice';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { protectedRoutes } from '@/config/routes.config';
import type { AllowanceState } from '@/lib/validations/assistant-chat';

const QUESTION_EXAMPLES = [
  'Who owes me money right now?',
  "What's overdue today?",
  'How much did I invoice this month?',
  'Where do I change the logo on my invoices?',
];
const DRAFT_EXAMPLE = 'Invoice Acme for 20 hours of consulting at $50';

export function StartPanel({
  state,
  start,
  onSend,
}: {
  state: AllowanceState;
  start?: 'draft';
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const isDraft = start === 'draft';
  const examples = isDraft ? [DRAFT_EXAMPLE] : QUESTION_EXAMPLES;

  function pick(example: string) {
    setText(example);
    boxRef.current?.focus();
  }

  function send() {
    const trimmed = text.trim();
    if (trimmed) onSend(trimmed);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isDraft ? 'Draft an invoice' : 'Ask about your invoices'}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.left === 0 ? (
          <AllowanceNotice state={state} handMadeLink={isDraft} />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {examples.map((example) => (
                <Button key={example} type="button" variant="outline" onClick={() => pick(example)}>
                  {example}
                </Button>
              ))}
            </div>
            <Textarea
              ref={boxRef}
              autoFocus={isDraft}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Message"
              placeholder={
                isDraft
                  ? `e.g. "${DRAFT_EXAMPLE}"`
                  : 'Ask a question or describe an invoice'
              }
            />
            <div className="flex items-center justify-between gap-3">
              <AllowanceNotice state={state} />
              <Button type="button" onClick={send}>
                Send
              </Button>
            </div>
            <Link
              href={protectedRoutes.settingsAssistants}
              className={buttonVariants({ variant: 'link', className: 'self-start px-0' })}
            >
              Connect your own AI client →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
