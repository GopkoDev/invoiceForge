import { InvoiceEditor } from '@/components/invoice-editor';
import { getInvoiceEditorData } from '@/lib/actions/invoice-actions/invoice-actions';
import { redirect, notFound } from 'next/navigation';
import { authRoutes } from '@/config/routes.config';

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

  if (!result.success) {
    if (result.error === 'Unauthorized') {
      redirect(authRoutes.signIn);
    }
    notFound();
  }

  if (!result.data || !result.data.initialData) {
    notFound();
  }

  return <InvoiceEditor data={result.data} />;
}
