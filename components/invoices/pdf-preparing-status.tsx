import { Loader2 } from 'lucide-react';

/** The screen-reader announcement for a PDF being prepared; renders nothing when it is not. */
export function PdfPreparingStatus({ busy }: { busy: boolean }) {
  if (!busy) return null;
  return (
    <span role="status" className="sr-only">
      Preparing PDF…
    </span>
  );
}

/** The spinner a PDF trigger shows in place of its icon while the PDF is being prepared. */
export function PdfPreparingSpinner() {
  return <Loader2 aria-hidden className="size-4 animate-spin" />;
}
