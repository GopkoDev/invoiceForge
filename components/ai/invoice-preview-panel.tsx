'use client';

import { AlertTriangleIcon, FileXIcon, InfoIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useApplyCardInvoiceState, useCardInvoiceState } from '@/components/ai/invoice-state-context';
import { IssueConfirmation } from '@/components/ai/issue-confirmation';
import { closePreview } from '@/components/ai/preview-address';
import { openConversationId } from '@/components/ai/conversation-list';
import { PDFPreviewPanel } from '@/components/invoice-editor/pdf-preview-panel';
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge';
import { ConfirmationModal } from '@/components/modals/global-modals/confirmation-modal/confirmation-modal';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { protectedRoutes } from '@/config/routes.config';
import { issueFromPreview, loadInvoicePreview } from '@/lib/actions/assistant-actions';
import { goToSignIn, redirectIfUnauthorized } from '@/lib/helpers/client-session-redirect';
import { prepareInvoiceDataForPdf } from '@/lib/helpers/invoice-pdf-helpers';
import type { InvoiceDocumentSource } from '@/lib/invoice-document';
import { cn } from '@/lib/utils';
import type { LinkedInvoiceState } from '@/types/assistant/types';
import type { InvoiceStatus, SerializedInvoice } from '@/types/invoice/types';

type Load =
  | { kind: 'loading' }
  | { kind: 'available'; invoice: SerializedInvoice; version: number; state: LinkedInvoiceState }
  | { kind: 'unavailable'; message: string }
  | { kind: 'not-found'; message: string }
  | { kind: 'failed'; message: string };

type Notice =
  | { kind: 'already-issued'; message: string }
  | { kind: 'changed'; message: string }
  | { kind: 'blocked'; message: string; fieldErrors: string[] };

const NO_LONGER_AVAILABLE = 'This invoice is no longer available.';
const UNAVAILABLE: LinkedInvoiceState = { state: 'UNAVAILABLE' };

/** The contract's not-found words (server-actions.md loadInvoicePreview, AC-22). */
const PREVIEW_NOT_FOUND = "This invoice can't be found.";

/**
 * ai-chat-v2 T24 (screens.md §SCR-06, §SCR-07; AC-19–AC-23, AC-25–AC-27; ADR-0005–ADR-0008): the invoice preview
 * of a created Draft card. Loads with loadInvoicePreview(cardId, conversationId) on open (and after CHANGED_ELSEWHERE), shows the
 * document the editor shows, and issues through issueFromPreview(invoiceId, version) after the confirmation.
 * Every result is written to the workspace invoice-state store, so the card and its links change with it. Opening
 * and issuing are never messages and never count. `variant` "sheet" stacks the footer for the phone sheet.
 */
export function InvoicePreviewPanel({ cardId, variant = 'column' }: { cardId: string; variant?: 'column' | 'sheet' }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const applyCard = useApplyCardInvoiceState();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const latest = useRef(0);
  // The open Conversation: a card of another Conversation reads not found, as AC-22 (review 2026-10-13 R9-2).
  const conversationId = openConversationId(usePathname());

  const available = load.kind === 'available' ? load : null;
  const stored = useCardInvoiceState(cardId, available?.invoice.id ?? null);
  const state = stored?.state === 'UNAVAILABLE' ? null : (stored ?? available?.state ?? null);
  const gone = stored?.state === 'UNAVAILABLE' && load.kind !== 'not-found';

  /** Reads the preview and routes the result; the current document stays until the new one arrives. */
  const read = useCallback(async () => {
    const request = ++latest.current;
    // At /ai there is no open Conversation: a preview address there is not found, without a read (R10-1).
    if (conversationId === null) {
      setLoad({ kind: 'not-found', message: PREVIEW_NOT_FOUND });
      return;
    }
    let result: Awaited<ReturnType<typeof loadInvoicePreview>>;
    try {
      result = await loadInvoicePreview(cardId, conversationId);
    } catch {
      goToSignIn();
      return;
    }
    if (request !== latest.current) return;
    if (redirectIfUnauthorized(result)) return;
    if (result.success) {
      if (result.data.kind === 'AVAILABLE') {
        const { invoice, version, state: loadedState } = result.data;
        applyCard(cardId, loadedState);
        setLoad({ kind: 'available', invoice, version, state: loadedState });
      } else {
        applyCard(cardId, UNAVAILABLE);
        setLoad({ kind: 'unavailable', message: NO_LONGER_AVAILABLE });
      }
    } else if (result.code === 'NOT_FOUND') {
      setLoad({ kind: 'not-found', message: result.error });
    } else {
      setLoad({ kind: 'failed', message: result.error });
    }
  }, [applyCard, cardId, conversationId]);

  useEffect(() => {
    void read();
  }, [read]);

  // Focus the heading on open; on close, give focus back to the card's Preview button (SCR-06).
  useEffect(() => {
    headingRef.current?.focus();
    return () => {
      setTimeout(() => {
        if (document.activeElement && document.activeElement !== document.body) return;
        document
          .getElementById(`draft-card-${cardId}`)
          ?.querySelector<HTMLElement>('button[aria-expanded]')
          ?.focus();
      }, 0);
    };
  }, [cardId]);

  async function retry() {
    setRetrying(true);
    try {
      await read();
    } finally {
      setRetrying(false);
    }
  }

  function startIssue() {
    if (notice?.kind === 'changed') setNotice(null);
    setConfirming(true);
  }

  async function issue() {
    if (!available) return;
    const { invoice, version } = available;
    try {
      const result = await issueFromPreview(invoice.id, version);
      if (redirectIfUnauthorized(result)) return;
      if (result.success) {
        applyCard(cardId, result.data.invoice);
        setNotice(null);
        toast.success(`Invoice ${invoice.invoiceNumber} issued.`);
        void read();
        return;
      }
      switch (result.code) {
        case 'CONFLICT':
          if (result.details?.kind === 'ALREADY_ISSUED') {
            applyCard(cardId, result.details.invoice);
            setNotice({ kind: 'already-issued', message: result.error });
            void read();
          } else if (result.details?.kind === 'CHANGED_ELSEWHERE') {
            setNotice({ kind: 'changed', message: result.error });
            setLoad({ kind: 'loading' });
            void read();
          } else {
            toast.error(result.error);
          }
          return;
        case 'VALIDATION':
          setNotice({
            kind: 'blocked',
            message: result.error,
            fieldErrors: Object.values(result.fieldErrors ?? {}).flat(),
          });
          return;
        case 'NOT_FOUND':
          applyCard(cardId, UNAVAILABLE);
          setLoad({ kind: 'unavailable', message: result.error });
          return;
        default:
          toast.error(result.error);
      }
    } finally {
      // The modal never closes itself: every outcome, a rejection included, closes it here (canon F-40).
      setConfirming(false);
    }
  }

  const source = useMemo<InvoiceDocumentSource | null>(
    () => (available ? { kind: 'issued', invoice: available.invoice } : null),
    [available]
  );
  const senderProfile = useMemo(
    () => (available ? (prepareInvoiceDataForPdf(available.invoice).senderProfile ?? undefined) : undefined),
    [available]
  );

  const title = available && !gone ? available.invoice.invoiceNumber : 'Invoice preview';
  const showDocument = Boolean(available) && !gone;
  const isDraft = showDocument && state?.state === 'DRAFT';
  const blocked = notice?.kind === 'blocked';
  const sheet = variant === 'sheet';

  return (
    <section
      aria-labelledby={headingId}
      data-slot="invoice-preview-panel"
      className={cn('bg-background flex min-h-0 min-w-0 flex-1 flex-col', !sheet && 'border-l')}
      onKeyDown={
        sheet
          ? undefined
          : (event) => {
              if (event.key === 'Escape' && !confirming) closePreview();
            }
      }
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="truncate text-base font-semibold outline-none">
          {title}
        </h2>
        {showDocument && state ? (
          state.state === 'ISSUED' ? (
            <InvoiceStatusBadge status={state.status.toUpperCase() as InvoiceStatus} />
          ) : (
            <Badge variant="secondary">Draft</Badge>
          )
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close preview"
          className="ml-auto shrink-0"
          onClick={() => closePreview()}
        >
          <XIcon aria-hidden />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {load.kind === 'loading' ? (
          <>
            <span role="status" className="sr-only">
              Loading preview…
            </span>
            <Skeleton className="aspect-[1/1.414] w-full" />
          </>
        ) : null}
        {load.kind === 'unavailable' || gone ? (
          <NoInvoice message={load.kind === 'unavailable' ? load.message : NO_LONGER_AVAILABLE} />
        ) : null}
        {load.kind === 'not-found' ? <NoInvoice message={load.message} /> : null}
        {load.kind === 'failed' ? (
          <Alert variant="destructive">
            <AlertDescription>{load.message}</AlertDescription>
            <div className="mt-2">
              <Button type="button" variant="outline" size="sm" disabled={retrying} onClick={() => void retry()}>
                {retrying ? <Spinner aria-hidden role="presentation" /> : null}
                Try again
              </Button>
            </div>
          </Alert>
        ) : null}
        {showDocument && notice?.kind === 'already-issued' ? (
          <Alert>
            <InfoIcon aria-hidden />
            <AlertDescription>{notice.message}</AlertDescription>
          </Alert>
        ) : null}
        {notice?.kind === 'changed' ? (
          <Alert className="border-amber-500/50">
            <AlertTriangleIcon aria-hidden className="text-amber-600" />
            <AlertDescription>{notice.message}</AlertDescription>
          </Alert>
        ) : null}
        {showDocument && notice?.kind === 'blocked' ? (
          <Alert variant="destructive">
            <AlertTitle>Can&apos;t issue this invoice</AlertTitle>
            <AlertDescription>
              <p>{notice.message}</p>
              {notice.fieldErrors.length > 0 ? (
                <ul className="list-disc pl-4">
                  {notice.fieldErrors.map((message, i) => (
                    <li key={i}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {showDocument && source ? (
          <div className="min-h-0 flex-1">
            <PDFPreviewPanel source={source} senderProfile={senderProfile} />
          </div>
        ) : null}
      </div>

      {load.kind === 'loading' || showDocument ? (
        <footer
          className={cn(
            'flex shrink-0 gap-2 border-t px-4 py-3',
            sheet ? 'flex-col-reverse' : 'flex-wrap justify-end'
          )}
        >
          {available && !gone ? (
            <Link
              href={protectedRoutes.invoiceEdit(available.invoice.id)}
              data-variant={blocked ? 'default' : 'outline'}
              className={cn(buttonVariants({ variant: blocked ? 'default' : 'outline' }), sheet && 'w-full')}
            >
              Open in editor
            </Link>
          ) : (
            <Button type="button" variant="outline" disabled className={cn(sheet && 'w-full')}>
              Open in editor
            </Button>
          )}
          {load.kind === 'loading' || isDraft ? (
            <Button
              type="button"
              variant={blocked ? 'outline' : 'default'}
              data-variant={blocked ? 'outline' : 'default'}
              disabled={load.kind === 'loading' || confirming}
              className={cn(sheet && 'w-full')}
              onClick={startIssue}
            >
              Issue invoice
            </Button>
          ) : null}
        </footer>
      ) : null}

      {available ? (
        <ConfirmationModal
          open={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={issue}
          title={`Issue invoice ${available.invoice.invoiceNumber}?`}
          description=""
          body={
            <IssueConfirmation
              customerName={available.invoice.customerName}
              total={available.invoice.total}
              currency={available.invoice.currency}
            />
          }
          confirmText="Issue invoice"
          cancelText="Cancel"
        />
      ) : null}
    </section>
  );
}

function NoInvoice({ message }: { message: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileXIcon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{message}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}
