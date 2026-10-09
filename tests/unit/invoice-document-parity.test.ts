// @vitest-environment jsdom
// editor-ux T10 (AC-09, AC-10; ADR-0002; spec §6 "PDF / preview parity") — the HTML preview and the PDF
// lay out the same InvoiceDocument, so their printed text is identical and follows the model's order.
//
// API pinned here (implementer):
//   components/invoice-editor/pdf-preview-document.tsx: <PDFPreviewDocument document={InvoiceDocument} logoSrc?={string} />
//   lib/pdf/invoice-pdf-kit.tsx:                       <InvoicePDFDocument document={InvoiceDocument} logoBase64?={string|null} />
// Neither layout formats a date/amount or holds a label of its own.
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));

import { PDFPreviewDocument } from '@/components/invoice-editor/pdf-preview-document';
const { InvoicePDFDocument } = await import('@/lib/pdf/invoice-pdf-kit');
import type { InvoiceDocument } from '@/lib/invoice-document';
import { pdfTextRuns } from '../support/pdf-text';
import { FIXTURES, flat, modelStrings, norm } from '../support/invoice-document-fixtures';

function previewText(document: InvoiceDocument): string {
  const { container } = render(createElement(PDFPreviewDocument as never, { document } as never));
  const walker = window.document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.textContent ?? '');
  return flat(parts);
}

function pdfText(document: InvoiceDocument): string {
  return flat(pdfTextRuns(createElement(InvoicePDFDocument as never, { document } as never)));
}

describe('preview / PDF parity over the fixture set', () => {
  for (const { name, document } of FIXTURES) {
    describe(name, () => {
      const expected = flat(modelStrings(document));

      it('the preview prints exactly the model strings, in order', () => {
        expect(previewText(document)).toBe(expected);
      });

      it('the PDF prints exactly the model strings, in order', () => {
        expect(pdfText(document)).toBe(expected);
      });

      it('preview and PDF text are identical', () => {
        expect(previewText(document)).toBe(pdfText(document));
      });
    });
  }
});

describe('money and days in both layouts (AC-09)', () => {
  it('USD shows "$1,234.50" and UAH shows "UAH 1,234.50" in preview and PDF', () => {
    const usd = FIXTURES.find((f) => f.name === 'draft, USD')!.document;
    const uah = FIXTURES.find((f) => f.name === 'draft, UAH')!.document;
    for (const text of [previewText(usd), pdfText(usd)]) {
      expect(text).toContain('$1,234.50');
      expect(text).toContain('Jan 5, 2026');
      expect(text).not.toMatch(/\d\.\d\d USD|05\.01\.2026/);
    }
    for (const text of [previewText(uah), pdfText(uah)]) {
      expect(text).toContain(norm('UAH 1,234.50'));
      expect(text).not.toMatch(/\d\.\d\d UAH/);
    }
  });
});

describe('issued invoice with parties changed since issue (AC-10)', () => {
  const doc = FIXTURES.find((f) => f.name === 'issued, parties changed since')!.document;
  it.each([
    ['preview', () => previewText(doc)],
    ['PDF', () => pdfText(doc)],
  ])('%s shows the issued details, not the current records', (_n, text) => {
    const t = text();
    expect(t).toContain('Acme Studio');
    expect(t).toContain('Bank One');
    expect(t).not.toMatch(/Renamed|Lviv|Bank Two|NEWIBAN/);
  });
});
