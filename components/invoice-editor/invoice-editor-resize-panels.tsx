import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { FileText } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ReactNode } from 'react';

interface InvoiceEditorResizePanelsProps {
  FormComponent: ReactNode;
  PDFPreviewComponent: ReactNode;
  panelRatio?: { form: number; pdf: number };
}

export function InvoiceEditorResizePanels({
  FormComponent,
  PDFPreviewComponent,
  panelRatio = { form: 60, pdf: 40 },
}: InvoiceEditorResizePanelsProps) {
  const isMobile = useIsMobile();

  if (!isMobile)
    return (
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={panelRatio.form}>
            {FormComponent}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={panelRatio.pdf}>
            {PDFPreviewComponent}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    );

  return (
    <div className="flex-1 overflow-hidden">
      {FormComponent}
      <Sheet>
        <SheetTrigger className="bg-primary text-primary-foreground hover:bg-primary/80 fixed right-4 bottom-4 z-50 inline-flex h-10 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium shadow-lg">
          <FileText className="mr-2 h-5 w-5" />
          View PDF
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="h-[90dvh] max-h-[90vh] gap-0 overflow-hidden p-0"
        >
          <SheetHeader className="sr-only p-0">
            <SheetTitle>PDF Preview</SheetTitle>
          </SheetHeader>
          {PDFPreviewComponent}
        </SheetContent>
      </Sheet>
    </div>
  );
}
