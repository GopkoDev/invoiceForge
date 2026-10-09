import { InvoiceEditor } from '@/components/invoice-editor';
import { InvoiceEditorModalContainer } from '@/components/modals/invoice-editor/invoice-editor-modal-container';
import { getInvoiceEditorData } from '@/lib/actions/invoice-actions/invoice-actions';
import { notFound } from 'next/navigation';
import { unwrapPageResult } from '@/components/layout/content-area';
import { InvoiceEditorProvider } from '@/store/invoice-editor-store/invoice-editor-provider';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';

export const metadata = {
  title: 'Edit Invoice',
  description: 'Edit existing invoice',
};

interface EditInvoicePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditInvoicePage({
  params,
}: EditInvoicePageProps) {
  const { id } = await params;

  const [actorResult, result] = await Promise.all([actingFreelancerFromSession(), getInvoiceEditorData(id)]);
  const { userId } = unwrapPageResult(actorResult);
  const data = unwrapPageResult(result);

  if (!data.initialData) {
    notFound();
  }

  // ADR-0003: one store per mounted editor, keyed by Freelancer and invoice, built from this data.
  return (
    <InvoiceEditorProvider key={`${userId}:${id}`} initial={data}>
      <InvoiceEditor />
      <InvoiceEditorModalContainer />
    </InvoiceEditorProvider>
  );
}
