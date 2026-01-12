import { ContentAreaHeaderLoading } from '@/components/layout/content-area';
import { InvoicesTableSkeleton } from '@/components/invoices';

export default function InvoicesLoading() {
  return (
    <>
      <ContentAreaHeaderLoading
        titleText="Invoices"
        descriptionText="Manage and track all your invoices"
        buttonText="New Invoice"
      />

      <InvoicesTableSkeleton />
    </>
  );
}
