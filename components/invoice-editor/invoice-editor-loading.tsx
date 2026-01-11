import { Loader2 } from 'lucide-react';

interface InvoiceEditorLoadingProps {
  message?: string;
}

export function InvoiceEditorLoading({
  message = 'Loading editor...',
}: InvoiceEditorLoadingProps) {
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

