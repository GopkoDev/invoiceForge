import { InvoiceEditor } from '@/components/invoice-editor';
import { getInvoiceEditorData } from '@/lib/actions/invoice-actions/invoice-actions';
import { unwrapPageResult } from '@/components/layout/content-area';
import { InvoiceEditorProvider } from '@/store/invoice-editor-store/invoice-editor-provider';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';

export const metadata = {
  title: 'New Invoice',
  description: 'Create a new invoice',
};

export default async function NewInvoicePage() {
  const [actorResult, result] = await Promise.all([actingFreelancerFromSession(), getInvoiceEditorData()]);
  const { userId } = unwrapPageResult(actorResult);
  const data = unwrapPageResult(result);

  // ADR-0003: one store per mounted editor, keyed by Freelancer and invoice, built from this data.
  return (
    <InvoiceEditorProvider key={`${userId}:new`} initial={data}>
      <InvoiceEditor />
    </InvoiceEditorProvider>
  );
}
