import { protectedRoutes } from '@/config/routes.config';
import { ContentAreaNotFound } from '@/components/layout/content-area';

export default function InvoiceEditNotFound() {
  return (
    <ContentAreaNotFound
      title="Invoice Not Found"
      description="The invoice you're trying to edit doesn't exist or you don't have access to it."
      backHref={protectedRoutes.invoices}
      backText="Back to Invoices"
    />
  );
}
