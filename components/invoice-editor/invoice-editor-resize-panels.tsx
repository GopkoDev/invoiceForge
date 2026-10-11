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
import { ReactNode } from 'react';

interface InvoiceEditorResizePanelsProps {
  FormComponent: ReactNode;
  PDFPreviewComponent: ReactNode;
  panelRatio?: { form: number; pdf: number };
}

// ADR-0004: one tree for both layouts. The form's parent chain never changes across the md
// breakpoint, so a width change cannot remount it (AC-14); phones hide the split's handle and
// preview pane with CSS (display: none, so a screen reader skips them) and open the preview in a
// sheet instead.
export function InvoiceEditorResizePanels({
  FormComponent,
  PDFPreviewComponent,
  panelRatio = { form: 60, pdf: 40 },
}: InvoiceEditorResizePanelsProps) {
  return (
    <div className="flex-1 overflow-hidden">
      <ResizablePanelGroup
        orientation="horizontal"
        className="max-md:block!"
      >
        <ResizablePanel
          defaultSize={panelRatio.form}
          className="max-md:h-full max-md:w-full"
        >
          {FormComponent}
        </ResizablePanel>
        <ResizableHandle withHandle className="max-md:hidden" />
        <ResizablePanel
          defaultSize={panelRatio.pdf}
          className="max-md:hidden"
        >
          {PDFPreviewComponent}
        </ResizablePanel>
      </ResizablePanelGroup>
      <Sheet>
        <SheetTrigger className="bg-primary text-primary-foreground hover:bg-primary/80 fixed right-4 bottom-4 z-50 inline-flex h-10 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium shadow-lg md:hidden">
          <FileText className="mr-2 h-5 w-5" />
          View PDF
        </SheetTrigger>
        <SheetContent
          side="bottom"
          closeLabel="Close preview"
          className="h-[90dvh] max-h-[90vh] gap-0 overflow-hidden p-0 md:hidden"
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
