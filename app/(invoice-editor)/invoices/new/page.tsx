import { InvoiceEditor } from '@/components/invoice-editor';
import { getInvoiceEditorData } from '@/lib/actions/invoice-actions/invoice-actions';
import { notFound } from 'next/navigation';

export const metadata = {
  title: 'New Invoice',
  description: 'Create a new invoice',
};

export default async function NewInvoicePage() {
  const result = await getInvoiceEditorData();

  if (!result.success || !result.data) {
    return notFound();
  }

  return <InvoiceEditor data={result.data} />;
}
