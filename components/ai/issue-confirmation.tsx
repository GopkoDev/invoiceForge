import { formatNumber } from '@/lib/format';

/**
 * ai-chat-v2 T24 (screens.md §SCR-07; AC-23, AC-26b): the body of the canon ConfirmationModal before issuing from
 * the chat's preview. The figures come from the preview the panel shows (the loaded invoice, never a cached card).
 */
export function IssueConfirmation({
  customerName,
  total,
  currency,
}: {
  customerName: string;
  total: number;
  currency: string;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Customer</dt>
        <dd className="min-w-0 break-words">{customerName}</dd>
        <dt className="text-muted-foreground">Total</dt>
        <dd>
          {formatNumber(total)} {currency}
        </dd>
      </dl>
      <p>Once it&apos;s issued, its lines and amounts can no longer change.</p>
    </div>
  );
}
