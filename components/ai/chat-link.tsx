import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
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

const linkClass = buttonVariants({ variant: 'link' });

// A link the Assistant attached to a reply. Targets come only from the fixed app map or the
// invoice's current state, never from model-written text (AC-07, AC-36).
export function ChatLink({ link, state }: ChatLinkProps) {
  if (link.kind === 'page') {
    // A bank-accounts link stored without its profile id (before fix 2026-10-12) opens the profiles list.
    const page =
      link.page === 'sender-profile-bank-accounts' && !link.senderProfileId ? 'sender-profiles' : link.page;
    const title = APP_MAP.find((e) => e.page === page)?.title ?? page;
    return (
      <Link href={appPageRoute(page, link.senderProfileId)} className={linkClass}>
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
