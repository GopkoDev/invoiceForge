import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { LandingDemoSample } from '@/constants/public-pages-content';

/** Same frame as the chat draft card: full width, rounded-xl, border-coloured ring. */
const CARD_FRAME = 'w-full rounded-xl shadow-none ring-border';

type DemoDraftCardProps = Pick<
  LandingDemoSample,
  | 'customer'
  | 'lines'
  | 'total'
  | 'currency'
  | 'exampleLabel'
  | 'createLabel'
  | 'cardTitle'
  | 'customerLabel'
  | 'totalLabel'
>;

/**
 * Presentational replica of the chat's draft proposal card (ADR-0001), driven by fixed sample props only.
 * It holds no focusable element: the "Create" visual is a span, and the real links are the player's overlay.
 */
export function DemoDraftCard({
  customer,
  lines,
  total,
  currency,
  exampleLabel,
  createLabel,
  cardTitle,
  customerLabel,
  totalLabel,
}: DemoDraftCardProps) {
  return (
    <Card className={CARD_FRAME}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{cardTitle}</p>
          <Badge variant="outline">{exampleLabel}</Badge>
        </div>
        <dl className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2 text-sm">
            <dt className="text-muted-foreground shrink-0">{customerLabel}</dt>
            <dd className="min-w-0 text-right break-words">{customer}</dd>
          </div>
        </dl>
        <Separator />
        <ul className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <li key={i} className="flex items-start justify-between gap-2 text-sm">
              <p className="min-w-0 break-words">
                {line.description} — {line.quantityLabel}
              </p>
              <span className="shrink-0">{line.amount}</span>
            </li>
          ))}
        </ul>
        <Separator />
        <p className="flex justify-between gap-2 text-sm font-medium">
          <span>{totalLabel}</span>
          <span>
            {total} {currency}
          </span>
        </p>
        <div className="flex sm:justify-end">
          <span
            className={cn(buttonVariants(), 'w-full cursor-default select-none sm:w-auto')}
            aria-hidden="true"
          >
            {createLabel}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
