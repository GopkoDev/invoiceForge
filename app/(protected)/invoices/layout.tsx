import { ContentArea } from '@/components/layout/content-area';
import { ContentAreaHeader } from '@/components/layout/content-area';
import { buttonVariants } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { protectedRoutes } from '@/config/routes.config';
import { cn } from '@/lib/utils';
import { InvoiceModalContainer } from '@/components/modals/invoice/invoice-modal-container';

function InvoicesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ContentArea>
        <ContentAreaHeader
          title="Invoices"
          description="Manage and track all your invoices"
          rightContent={
            <Link
              href={protectedRoutes.invoicesNew}
              className={cn(buttonVariants())}
            >
              <Plus />
              New Invoice
            </Link>
          }
        />
        {children}
      </ContentArea>

      <InvoiceModalContainer />
    </>
  );
}

export default InvoicesLayout;
