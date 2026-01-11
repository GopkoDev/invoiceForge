import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

export function EditSentedInvoiceAlert() {
  return (
    <section className="bg-background mt-3 flex border-b">
      <Alert variant="destructive" className="mx-4 mb-3 lg:mx-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          You are editing a sent invoice. Changes may affect already sented url
          to this invoice.
        </AlertDescription>
      </Alert>
    </section>
  );
}
