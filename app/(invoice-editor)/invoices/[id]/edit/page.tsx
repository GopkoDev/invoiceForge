import { InvoiceEditor } from '@/components/invoice-editor';
import { getInvoiceEditorData } from '@/lib/actions/invoice-actions/invoice-actions';
import { notFound } from 'next/navigation';
import { unwrapPageResult } from '@/components/layout/content-area';

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

  const result = await getInvoiceEditorData(id);
  const data = unwrapPageResult(result);

  if (!data.initialData) {
    notFound();
  }

  return <InvoiceEditor data={data} />;
}
