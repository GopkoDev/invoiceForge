// @vitest-environment jsdom
// editor-ux T10, T35 (AC-09, AC-10; ADR-0002; spec §6 "PDF / preview parity") — the HTML preview and
// the PDF lay out the same InvoiceDocument, so their printed text is identical and follows the
// model's order. The PDF side is a REAL render (`pdf(doc).toBuffer()` of @react-pdf/renderer) read
// back from its bytes, not the element tree: a layout that prints a different string, drops a run or
// formats an amount itself shows up in the file the Freelancer gets.
//
// API pinned here (implementer):
//   components/invoice-editor/pdf-preview-document.tsx: <PDFPreviewDocument document={InvoiceDocument} logoSrc?={string} />
//   lib/pdf/invoice-pdf-kit.tsx:                       <InvoicePDFDocument document={InvoiceDocument} logoBase64?={string|null} />
// Neither layout formats a date/amount or holds a label of its own.
import { createElement } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));
// The kit registers the app's fonts (/fonts/roboto/*.ttf, served from public/). Here they are the
// same files read from this checkout, so the render never reaches the network.
vi.mock('@/config/pdf-config', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/config/pdf-config')>();
  const { localPdfFonts } = await import('../support/pdf-text');
  return { ...real, PDF_FONTS: { ...real.PDF_FONTS, URLS: localPdfFonts(real.PDF_FONTS.URLS) } };
});

import { PDFPreviewDocument } from '@/components/invoice-editor/pdf-preview-document';
const { InvoicePDFDocument } = await import('@/lib/pdf/invoice-pdf-kit');
import type { InvoiceDocument } from '@/lib/invoice-document';
import { renderedPdfText } from '../support/pdf-text';
import { FIXTURES, flat, modelStrings, norm } from '../support/invoice-document-fixtures';

// Only data: URLs (the fonts above and the layout engine's inlined wasm) may be fetched.
const realFetch = globalThis.fetch;
const fetched: string[] = [];
beforeAll(() => {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith('data:')) {
      fetched.push(url);
      return Promise.reject(new Error(`The PDF render tried the network: ${url}`));
    }
    return realFetch(input, init);
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

/**
 * The preview's printed text. `asShown` reads CSS `uppercase` titles in capitals, as the screen
 * shows them and as the PDF prints them (its section titles use textTransform: 'uppercase').
 */
function previewText(document: InvoiceDocument, asShown = true): string {
  const { container, unmount } = render(createElement(PDFPreviewDocument as never, { document } as never));
  const walker = window.document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? '';
    parts.push(asShown && n.parentElement?.closest('.uppercase') ? text.toUpperCase() : text);
  }
  unmount();
  return flat(parts);
}

// The PDF's page footer ("Page 1 of 1") is the one run the paper has and the screen does not.
const PAGINATION = /\s*Page \d+ of \d+\s*$/;

const pdfCache = new Map<InvoiceDocument, Promise<string>>();
function pdfText(document: InvoiceDocument): Promise<string> {
  if (!pdfCache.has(document)) {
    pdfCache.set(
      document,
      renderedPdfText(createElement(InvoicePDFDocument as never, { document } as never)),
    );
  }
  return pdfCache.get(document)!;
}

describe('the PDF is really rendered, from local fonts only', () => {
  it('prints its page footer (a render-time value the element tree does not hold) and fetches nothing remote', async () => {
    const text = await pdfText(FIXTURES[0].document);
    expect(text).toMatch(/Page 1 of 1$/);
    expect(fetched).toEqual([]);
  });
});

describe('preview / PDF parity over the fixture set', () => {
  for (const { name, document } of FIXTURES) {
    describe(name, () => {
      const expected = flat(modelStrings(document));

      it('the preview prints exactly the model strings, in order', () => {
        expect(previewText(document, false)).toBe(expected);
      });

      it('the rendered PDF prints exactly the model strings, in order (titles in capitals)', async () => {
        const text = (await pdfText(document)).replace(PAGINATION, '');
        expect(text.toLowerCase()).toBe(expected.toLowerCase());
        // Every value (amounts, days, party lines) is printed with its own case.
        for (const s of modelStrings(document)) {
          expect(text.includes(norm(s)) || text.includes(norm(s).toUpperCase())).toBe(true);
        }
      });

      it('preview and rendered PDF text are identical', async () => {
        expect((await pdfText(document)).replace(PAGINATION, '')).toBe(previewText(document));
      });
    });
  }
});

describe('money and days in both layouts (AC-09)', () => {
  it('USD shows "$1,234.50" and UAH shows "UAH 1,234.50" in preview and rendered PDF', async () => {
    const usd = FIXTURES.find((f) => f.name === 'draft, USD')!.document;
    const uah = FIXTURES.find((f) => f.name === 'draft, UAH')!.document;
    for (const text of [previewText(usd), await pdfText(usd)]) {
      expect(text).toContain('Design Logo work $617.25 2 h $1,234.50');
      expect(text).toContain('Subtotal: $1,234.50 TOTAL: $1,234.50');
      expect(text).toContain('Date: Jan 5, 2026 Due: Jan 19, 2026');
      expect(text).not.toMatch(/\d\.\d\d USD|1\.234,50|05\.01\.2026/);
    }
    for (const text of [previewText(uah), await pdfText(uah)]) {
      expect(text).toContain('Design Logo work UAH 617.25 2 h UAH 1,234.50');
      expect(text).toContain('Subtotal: UAH 1,234.50 TOTAL: UAH 1,234.50');
      expect(text).not.toMatch(/\d\.\d\d UAH|1\.234,50|₴/);
    }
  });
});

describe('issued invoice with parties changed since issue (AC-10)', () => {
  const doc = FIXTURES.find((f) => f.name === 'issued, parties changed since')!.document;
  it.each([
    ['preview', async () => previewText(doc)],
    ['rendered PDF', () => pdfText(doc)],
  ])('%s shows the issued details, not the current records', async (_n, text) => {
    const t = await text();
    expect(t).toContain('Acme Studio');
    expect(t).toContain('Bank One');
    expect(t).not.toMatch(/Renamed|Lviv|Bank Two|NEWIBAN/);
  });
});
