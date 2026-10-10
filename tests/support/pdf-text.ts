// The text an InvoicePDFDocument prints, two ways.
// - pdfTextRuns reads it from the element tree: function components are expanded, react-pdf
//   primitives (TEXT, VIEW, ...) are walked, and every string or number child is collected in
//   document order. Cheap, but it never touches the renderer.
// - renderedPdfText renders the element for real (`pdf(doc).toBuffer()` of @react-pdf/renderer) and
//   reads the text back from the PDF bytes, the way the Freelancer's file is read (ADR-0002 parity;
//   spec.md §6 "PDF fidelity": text, not bytes, because the logo stays current). The fonts must be
//   local: see localPdfFonts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement, ReactNode } from 'react';
import { extractText, getDocumentProxy } from 'unpdf';

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

/**
 * The font files the app serves (public/fonts/roboto, config/pdf-config.ts PDF_FONTS.URLS) as data
 * URLs, so a test render reads them from this checkout and never from the network. Use it in a
 * `vi.mock('@/config/pdf-config', ...)` factory before the PDF kit registers its fonts.
 */
export function localPdfFonts(urls: { REGULAR: string; BOLD: string }): { REGULAR: string; BOLD: string } {
  const dataUrl = (publicPath: string) =>
    `data:font/ttf;base64,${readFileSync(join(process.cwd(), 'public', publicPath)).toString('base64')}`;
  return { REGULAR: dataUrl(urls.REGULAR), BOLD: dataUrl(urls.BOLD) };
}

/** Renders a react-pdf <Document> for real and returns every page's text, whitespace collapsed. */
export async function renderedPdfText(document: ReactElement): Promise<string> {
  const { pdf } = await import('@react-pdf/renderer');
  const stream = (await pdf(document as Parameters<typeof pdf>[0]).toBuffer()) as unknown as AsyncIterable<Uint8Array>;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  const bytes = new Uint8Array(Buffer.concat(chunks));
  if (Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') throw new Error('The render is not a PDF file.');
  // verbosity 0: pdf.js would otherwise warn about every subset font it cannot substitute.
  const { text } = await extractText(await getDocumentProxy(bytes, { verbosity: 0 }), { mergePages: true });
  return text.replace(/\s+/g, ' ').trim();
}
