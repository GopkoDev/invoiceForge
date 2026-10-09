'use client';

import { useId } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { FileText } from 'lucide-react';
import {
  useNotesAndTerms,
  useEditorLocks,
  useInvoiceEditorActions,
} from '@/store/invoice-editor-store';

export function NotesSection() {
  const fieldId = useId();
  const { notes, terms, paymentTerms } = useNotesAndTerms();
  const { updateField } = useInvoiceEditorActions();
  // invoice-integrity T16 (SCR-02): notes and payment terms stay editable on an issued invoice; the
  // terms are locked; a cancelled invoice is read-only.
  const { locked, readOnly } = useEditorLocks();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          Additional
        </CardTitle>

        <CardDescription>
          Add notes and payment terms to the invoice
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-notes`}>Notes</Label>
          <Textarea
            id={`${fieldId}-notes`}
            value={notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Additional information for the client..."
            rows={3}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-payment-terms`}>Payment Terms</Label>
          <Input
            id={`${fieldId}-payment-terms`}
            value={paymentTerms}
            onChange={(e) => updateField('paymentTerms', e.target.value)}
            placeholder="e.g. Net 14"
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-terms`}>Terms</Label>
          <Textarea
            id={`${fieldId}-terms`}
            value={terms}
            onChange={(e) => updateField('terms', e.target.value)}
            placeholder="Payment terms and conditions..."
            rows={3}
            disabled={locked}
          />
        </div>
      </CardContent>
    </Card>
  );
}
