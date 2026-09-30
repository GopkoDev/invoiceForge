import { InvoiceEditor } from '@/components/invoice-editor';
import { getInvoiceEditorData } from '@/lib/actions/invoice-actions/invoice-actions';
import { unwrapPageResult } from '@/components/layout/content-area';

export const metadata = {
  title: 'New Invoice',
  description: 'Create a new invoice',
};

export default async function NewInvoicePage() {
  const result = await getInvoiceEditorData();
  const data = unwrapPageResult(result);

  return <InvoiceEditor data={data} />;
}
