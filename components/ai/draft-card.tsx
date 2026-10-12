'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { protectedRoutes } from '@/config/routes.config';
import { createDraftFromCard } from '@/lib/actions/assistant-actions';
import { formatDay, formatNumber } from '@/lib/format';
import { goToSignIn, redirectIfUnauthorized } from '@/lib/helpers/client-session-redirect';
import type { DraftCardView, LinkedInvoiceState } from '@/types/assistant/types';
import type { InvoiceStatus } from '@/types/invoice/types';

type CardResult = Extract<Awaited<ReturnType<typeof createDraftFromCard>>, { success: true }>['data'];
type DraftIssue = Extract<CardResult, { kind: 'NEEDS_ANSWERS' }>['issues'][number];

type View =
  | { kind: 'live' }
  | { kind: 'created'; invoice: LinkedInvoiceState }
  | { kind: 'replaced'; newerId: string }
  | { kind: 'outdated'; newerId: string | null; successor: DraftCardView | null }
  | { kind: 'needs-answers'; issues: DraftIssue[] }
  | { kind: 'stale' }
  | { kind: 'gone' };

const OUTDATED_COPY =
  'Something changed since this card was made: a price, the Customer, the sender profile, the bank account or the date. Check the updated card below.';

const linkClass =
  'inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline focus-visible:underline outline-none';

const DEFAULT_LABELS: Record<string, string> = {
  senderProfile: 'sender profile',
  bankAccount: 'bank account',
  issueDate: 'issue date',
  dueDate: 'due date',
};

function initialView(card: DraftCardView): View {
  switch (card.state) {
    case 'CREATED':
      return { kind: 'created', invoice: card.invoice ?? { state: 'UNAVAILABLE' } };
    case 'REPLACED':
      return card.replacedById ? { kind: 'replaced', newerId: card.replacedById } : { kind: 'stale' };
    case 'OUTDATED':
      return card.replacedById
        ? { kind: 'outdated', newerId: card.replacedById, successor: null }
        : { kind: 'stale' };
    default:
      return { kind: 'live' };
  }
}

const money = (value: string) => formatNumber(Number(value));
const plainQuantity = (value: string) => (value.endsWith('.00') ? value.slice(0, -3) : value);

function defaultsList(defaultsUsed: string[]): string {
  const words: string[] = [];
  for (const key of defaultsUsed) {
    const word = DEFAULT_LABELS[key] ?? key.replace(/^lines\[\d+\]\./, '');
    if (!words.includes(word)) words.push(word);
  }
  return words.join(', ');
}

function issueCopy(issue: DraftIssue): string {
  switch (issue.kind) {
    case 'CUSTOMER_NOT_FOUND':
      return `${issue.written} is no longer among your Customers.`;
    case 'CUSTOMER_AMBIGUOUS':
    case 'CUSTOMER_NEAR_MISS':
      return `${issue.written} no longer matches exactly one of your Customers.`;
    case 'NO_SENDER_PROFILE_WITH_ACCOUNT':
      return 'You need a sender profile with a bank account.';
    case 'DEFAULT_PROFILE_WITHOUT_ACCOUNT':
      return 'Your default sender profile has no bank account.';
    case 'SENDER_PROFILE_NOT_FOUND':
      return `${issue.written} is no longer among your sender profiles.`;
    case 'LINE_AMOUNT_MISSING':
      return `${issue.description} has no amount.`;
    case 'LINE_PRICE_MISSING_IN_CURRENCY':
      return `A line has no price in ${issue.currency}.`;
    case 'CURRENCY_UNCLEAR':
      return `The currency ${issue.written} is unclear.`;
    case 'NO_ACCOUNT_IN_CURRENCY':
      return `You have no bank account in ${issue.currency}.`;
    case 'SEVERAL_ACCOUNTS_IN_CURRENCY':
      return `You have several bank accounts in ${issue.currency}.`;
    case 'BANK_ACCOUNT_NOT_FOUND':
      return `${issue.written} is no longer among this sender profile's bank accounts.`;
    case 'BANK_ACCOUNT_AMBIGUOUS':
      return `${issue.written} no longer matches exactly one of your bank accounts.`;
    case 'LINE_QUANTITY_MISSING':
      return `${issue.description} has no quantity.`;
    case 'PRODUCT_AMBIGUOUS':
      return `${issue.written} no longer matches exactly one of your products.`;
    case 'PRODUCT_NOT_FOUND':
      return "A line's product is no longer in your catalogue.";
    case 'FIELD_INVALID':
      return issue.message;
  }
}

/** The editor defaults of the three amounts the request left out, e.g. "No discount or shipping." */
function unsetAmountsCopy(proposal: DraftCardView['proposal']): string | null {
  const unset = [
    !proposal.taxRate && 'tax',
    !proposal.discount && 'discount',
    !proposal.shipping && 'shipping',
  ].filter((w): w is string => Boolean(w));
  if (unset.length === 0) return null;
  const words = unset.length === 1 ? unset[0] : `${unset.slice(0, -1).join(', ')} or ${unset[unset.length - 1]}`;
  return `No ${words}.`;
}

const FROM_REQUEST = ' (from your request)';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-muted-foreground w-28 shrink-0 text-sm">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  );
}

function AmountRow({ label, value, currency }: { label: string; value: string; currency: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        {money(value)} {currency}
      </dd>
    </div>
  );
}

function CreatedLine({ invoice }: { invoice: LinkedInvoiceState }) {
  if (invoice.state === 'UNAVAILABLE') {
    return <p className="text-muted-foreground text-sm">This draft is no longer available.</p>;
  }
  const href = protectedRoutes.invoiceEdit(invoice.invoiceId);
  if (invoice.state === 'DRAFT') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">Draft {invoice.invoiceNumber} created.</p>
        <Link href={href} className={linkClass}>
          Open draft →
        </Link>
      </div>
    );
  }
  return (
    <Link href={href} className={linkClass}>
      Invoice {invoice.invoiceNumber}
      <InvoiceStatusBadge status={invoice.status.toUpperCase() as InvoiceStatus} />
    </Link>
  );
}

export function DraftCard({ card }: { card: DraftCardView }) {
  const [view, setView] = useState<View>(() => initialView(card));
  const [pending, setPending] = useState(false);
  const firing = useRef(false);
  const { proposal } = card;
  const customer = proposal.customer.name.freelancerText;
  const summary = `Draft invoice · ${customer} · ${money(proposal.total)} ${proposal.currency}`;

  async function create() {
    if (firing.current) return;
    firing.current = true;
    setPending(true);
    try {
      const result = await createDraftFromCard(card.id);
      if (redirectIfUnauthorized(result)) return;
      if (!result.success) {
        toast.error(result.error);
        if (result.code === 'NOT_FOUND') setView({ kind: 'gone' });
        return;
      }
      const data = result.data;
      switch (data.kind) {
        case 'CREATED':
          setView({
            kind: 'created',
            invoice: { state: 'DRAFT', invoiceId: data.invoiceId, invoiceNumber: data.invoiceNumber },
          });
          break;
        case 'ALREADY_CREATED':
          setView({ kind: 'created', invoice: data.invoice });
          break;
        case 'REPLACED':
          setView({ kind: 'replaced', newerId: data.newerCardId });
          break;
        case 'OUTDATED':
          setView({ kind: 'outdated', newerId: data.card.id, successor: data.card });
          break;
        case 'NEEDS_ANSWERS':
          setView({ kind: 'needs-answers', issues: data.issues });
          break;
      }
    } catch {
      goToSignIn();
    } finally {
      firing.current = false;
      setPending(false);
    }
  }

  function goToNewer(newerId: string) {
    document.getElementById(`draft-card-${newerId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (view.kind !== 'live' && view.kind !== 'created') {
    const badge = view.kind === 'replaced' ? 'Replaced' : view.kind === 'gone' ? null : 'Outdated';
    return (
      <>
        <Card id={`draft-card-${card.id}`} className="opacity-70">
          <CardContent className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{summary}</p>
              {badge && <Badge variant="secondary">{badge}</Badge>}
            </div>
            {view.kind === 'replaced' && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-muted-foreground text-sm">A newer card replaced this one.</p>
                <Button type="button" variant="link" size="xs" onClick={() => goToNewer(view.newerId)}>
                  Go to the newer card ↓
                </Button>
              </div>
            )}
            {view.kind === 'outdated' && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-muted-foreground text-sm">{OUTDATED_COPY}</p>
                {view.newerId && !view.successor && (
                  <Button type="button" variant="link" size="xs" onClick={() => goToNewer(view.newerId!)}>
                    Go to the newer card ↓
                  </Button>
                )}
              </div>
            )}
            {view.kind === 'stale' && (
              <p className="text-muted-foreground text-sm">
                This card is out of date and can&apos;t be created. Ask again in the chat.
              </p>
            )}
            {view.kind === 'needs-answers' && (
              <Alert>
                <AlertDescription>
                  <ul className="flex flex-col gap-1">
                    {view.issues.map((issue, i) => (
                      <li key={i}>{issueCopy(issue)}</li>
                    ))}
                  </ul>
                  <p>Nothing was created. Ask again in the chat.</p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
        {view.kind === 'outdated' && view.successor && <DraftCard card={view.successor} />}
      </>
    );
  }

  const created = view.kind === 'created';
  const senderDefault = proposal.senderProfile.source === 'DEFAULT';
  const bankDefault = proposal.bankAccount.source === 'DEFAULT';
  const defaults = defaultsList(proposal.defaultsUsed);

  return (
    <Card id={`draft-card-${card.id}`}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Draft invoice</p>
          <Badge variant={created ? 'default' : 'outline'}>{created ? 'Created' : 'Proposed'}</Badge>
        </div>
        <dl className="flex flex-col gap-1.5">
          <Row label="Customer">{customer}</Row>
          <Row label="From">
            {proposal.senderProfile.name.freelancerText} {senderDefault ? '(default)' : '(you named it)'}
          </Row>
          <Row label="Bank account">
            {proposal.bankAccount.label} · {proposal.bankAccount.currency}{' '}
            {bankDefault ? '(default)' : '(matches the currency you asked for)'}
          </Row>
          <Row label="Issue date">
            {formatDay(proposal.issueDate.value)}
            {proposal.issueDate.source === 'DEFAULT' && ' (today, default)'}
          </Row>
          <Row label="Due date">
            {formatDay(proposal.dueDate.value)}
            {proposal.dueDate.source === 'DEFAULT' && ' (in 30 days, default)'}
          </Row>
          {proposal.poNumber && <Row label="PO number">{proposal.poNumber.value}{FROM_REQUEST}</Row>}
          {proposal.paymentTerms && (
            <Row label="Payment terms">{proposal.paymentTerms.value}{FROM_REQUEST}</Row>
          )}
          {proposal.notes && <Row label="Notes">{proposal.notes.value}{FROM_REQUEST}</Row>}
          {proposal.terms && <Row label="Terms">{proposal.terms.value}{FROM_REQUEST}</Row>}
        </dl>
        <Separator />
        <ul className="flex flex-col gap-2">
          {proposal.lines.map((line, i) => {
            const qtyDefault = line.quantitySource === 'DEFAULT';
            const unitDefault = line.unitSource === 'DEFAULT';
            const rateSource =
              line.rateSource === 'CUSTOM_PRICE'
                ? `Custom price agreed with ${customer}`
                : line.rateSource === 'CATALOGUE'
                  ? `Price from your product ${line.name}`
                  : 'Price you named';
            return (
              <li key={i} className="flex flex-col gap-0.5">
                <p className="text-sm break-words">
                  {line.name} {plainQuantity(line.quantity)}
                  {qtyDefault && !unitDefault && ' (default)'} {line.unit}
                  {unitDefault && ' (default)'} × {money(line.rate)} = {money(line.amount)} {proposal.currency}
                </p>
                <p className="text-muted-foreground pl-3 text-xs">
                  {rateSource}
                  {line.agreedCustomPrice ? ` · Agreed custom price: ${money(line.agreedCustomPrice)} ${proposal.currency}` : ''}
                  {line.productId === null ? ' · Not linked to a product' : ''}
                </p>
              </li>
            );
          })}
        </ul>
        <Separator />
        {(proposal.taxRate || proposal.discount || proposal.shipping) && (
          <dl className="flex flex-col gap-1 text-sm">
            <AmountRow label="Subtotal" value={proposal.subtotal} currency={proposal.currency} />
            {proposal.discount && (
              <AmountRow label={`Discount${FROM_REQUEST}`} value={proposal.discount.value} currency={proposal.currency} />
            )}
            {proposal.shipping && (
              <AmountRow label={`Shipping${FROM_REQUEST}`} value={proposal.shipping.value} currency={proposal.currency} />
            )}
            {proposal.taxRate && (
              <AmountRow
                label={`Tax ${plainQuantity(proposal.taxRate.value)} %${FROM_REQUEST}`}
                value={proposal.taxAmount ?? '0.00'}
                currency={proposal.currency}
              />
            )}
          </dl>
        )}
        <p className="flex justify-between gap-2 text-sm font-medium">
          <span>Total</span> <span>{money(proposal.total)} {proposal.currency}</span>
        </p>
        <p className="text-muted-foreground text-xs">
          {[unsetAmountsCopy(proposal), 'The invoice number is assigned when the draft is created.']
            .filter(Boolean)
            .join(' ')}
        </p>
        {defaults && <p className="text-muted-foreground text-xs">Defaults used: {defaults}.</p>}
        {view.kind === 'created' ? (
          <CreatedLine invoice={view.invoice} />
        ) : (
          <div className="flex sm:justify-end">
            <Button type="button" disabled={pending} onClick={create} className="w-full sm:w-auto">
              {pending && <Spinner />}
              Create draft
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
