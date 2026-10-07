import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import type { EditorMode } from '@/store/invoice-editor-store';

// invoice-integrity T16 (SCR-02, decision 2): a permanent info Alert in the issued and cancelled modes.
const MODE_TEXT: Partial<Record<EditorMode, string>> = {
  issued:
    'This invoice is issued. You can change only the due date, notes, payment terms and PO number. To correct anything else, cancel it and duplicate it.',
  cancelled: "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft.",
};

export function EditorModeAlert({ mode }: { mode: EditorMode }) {
  const text = MODE_TEXT[mode];
  if (!text) return null;
  return (
    <section className="bg-background mt-3 flex border-b">
      <Alert className="mx-4 mb-3 lg:mx-6">
        <Info className="h-4 w-4" />
        <AlertDescription>{text}</AlertDescription>
      </Alert>
    </section>
  );
}
