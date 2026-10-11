import { Loader2 } from 'lucide-react';

/**
 * The screen-reader announcement for a PDF being prepared. The region is always mounted and only its
 * text changes (a region mounted together with its text is often not announced); place it outside any
 * button or menu item, whose children are presentational.
 */
export function PdfPreparingStatus({ busy }: { busy: boolean }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {busy ? 'Preparing PDF…' : ''}
    </span>
  );
}

/** The spinner a PDF trigger shows in place of its icon while the PDF is being prepared. */
export function PdfPreparingSpinner() {
  return <Loader2 aria-hidden className="size-4 animate-spin" />;
}
