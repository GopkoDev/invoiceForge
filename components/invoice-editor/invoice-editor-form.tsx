import { ScrollArea } from '@/components/ui/scroll-area';
import { SenderSection } from './sender-section';
import { CustomerSection } from './customer-section';
import { InvoiceDetailsSection } from './invoice-details-section';
import { ItemsSection } from './items-section';
import { SummarySection } from './summary-section';
import { NotesSection } from './notes-section';
import { useIsMobile } from '@/hooks/use-mobile';

export function InvoiceEditorForm() {
  const isMobile = useIsMobile();

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4 lg:p-6">
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
