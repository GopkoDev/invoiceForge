import Link from 'next/link';
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge';
import { protectedRoutes } from '@/config/routes.config';
import { APP_MAP, appPageRoute } from '@/lib/ai/app-map';
import type { AppLink } from '@/lib/validations/assistant-chat';
import type { LinkedInvoiceState } from '@/types/assistant/types';
import type { InvoiceStatus } from '@/types/invoice/types';

interface ChatLinkProps {
  link: AppLink;
  state?: LinkedInvoiceState;
}

const linkClass =
  'inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline focus-visible:underline outline-none';

// A link the Assistant attached to a reply. Targets come only from the fixed app map or the
// invoice's current state, never from model-written text (AC-07, AC-36).
export function ChatLink({ link, state }: ChatLinkProps) {
  if (link.kind === 'page') {
    const title = APP_MAP.find((e) => e.page === link.page)?.title ?? link.page;
    return (
      <Link href={appPageRoute(link.page, link.senderProfileId)} className={linkClass}>
        {title} →
      </Link>
    );
  }

  if (!state) {
    return <span className="text-sm">{link.label}</span>;
  }
  if (state.state === 'UNAVAILABLE') {
    return <span className="text-muted-foreground text-sm">{link.label} · No longer available</span>;
  }
  const href = protectedRoutes.invoiceEdit(state.invoiceId);
  if (state.state === 'DRAFT') {
    return (
      <Link href={href} className={linkClass}>
        {state.invoiceNumber} · Draft
      </Link>
    );
  }
  return (
    <Link href={href} className={linkClass}>
      {state.invoiceNumber}
      <InvoiceStatusBadge status={state.status.toUpperCase() as InvoiceStatus} />
    </Link>
  );
}
