// The text an InvoicePDFDocument prints, read from its element tree: function components are
// expanded, react-pdf primitives (TEXT, VIEW, ...) are walked, and every string or number child is
// collected in document order. A real render needs the remote fonts; the printed text is what the
// fidelity NFR compares (spec.md §6 "PDF fidelity": text, not bytes, because the logo stays current).
import type { ReactElement, ReactNode } from 'react';

function collect(node: ReactNode, out: string[]): void {
  if (node === null || node === undefined || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return;
  }
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (typeof element.type === 'function') {
    collect((element.type as (props: unknown) => ReactNode)(element.props), out);
    return;
  }
  // A <Text> groups its children into one printed run; other primitives just nest.
  if (element.type === 'TEXT') {
    const run: string[] = [];
    collect(element.props.children, run);
    out.push(run.join(''));
    return;
  }
  collect(element.props?.children, out);
}

/** One entry per printed <Text> run, in document order. */
export function pdfTextRuns(document: ReactNode): string[] {
  const out: string[] = [];
  collect(document, out);
  return out;
}
