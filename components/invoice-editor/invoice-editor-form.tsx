import { ScrollArea } from '@/components/ui/scroll-area';
import { SenderSection } from './sender-section';
import { CustomerSection } from './customer-section';
import { InvoiceDetailsSection } from './invoice-details-section';
import { ItemsSection } from './items-section';
import { SummarySection } from './summary-section';
import { NotesSection } from './notes-section';
import { useIsMobile } from '@/hooks/use-mobile';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLockedRefusal } from '@/store/invoice-editor-store';

export function InvoiceEditorForm() {
  const isMobile = useIsMobile();
  // invoice-integrity T17 (SCR-02 issued — locked-field refusal), reachable only from a stale form.
  const lockedRefusal = useLockedRefusal();

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4 lg:p-6">
        {lockedRefusal && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{lockedRefusal}</AlertDescription>
          </Alert>
        )}
        <SenderSection />
        <CustomerSection />
        <InvoiceDetailsSection />
        <ItemsSection />
        <SummarySection />
        <NotesSection />

        {/* Spacer for mobile floating button */}
        {isMobile && <div className="h-20" />}
      </div>
    </ScrollArea>
  );
}
