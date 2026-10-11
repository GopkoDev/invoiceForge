// @vitest-environment jsdom
// editor-ux T23 (AC-10, AC-09; ADR-0002; review 2026-10-10 D3) — an issued invoice prints the amounts stored
// at issue (line amounts, subtotal, tax, total), never a recompute; only the draft path recomputes.
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));

import { PDFPreviewDocument } from '@/components/invoice-editor/pdf-preview-document';
const { InvoicePDFDocument } = await import('@/lib/pdf/invoice-pdf-kit');
import { buildInvoiceDocument, type InvoiceDocument } from '@/lib/invoice-document';
import { formatMoney } from '@/lib/format';
import { pdfTextRuns } from '../support/pdf-text';
import { flat, makeForm, makeIssued, norm, parties } from '../support/invoice-document-fixtures';

function previewText(document: InvoiceDocument): string {
  const { container } = render(createElement(PDFPreviewDocument as never, { document } as never));
  const walker = window.document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.textContent ?? '');
  return flat(parts);
}
const pdfText = (document: InvoiceDocument) =>
  flat(pdfTextRuns(createElement(InvoicePDFDocument as never, { document } as never)));

// Lines recompute to 1,234.50 / tax 123.45 / total 1,357.95; the stored (legacy) values differ.
const form = makeForm({ taxRate: 10 });
const usd = (n: number) => norm(formatMoney(n, 'USD'));

function legacyIssued() {
  const inv = makeIssued(form);
  inv.items[0].amount = 1000;
  inv.subtotal = 1000;
  inv.taxAmount = 77;
  inv.total = 1077;
  return inv;
}

describe('issued invoice prints stored amounts (AC-10, D3)', () => {
  const doc = buildInvoiceDocument({ kind: 'issued', invoice: legacyIssued() });

  it('the document carries the stored line amount, subtotal, tax and total', () => {
    expect(doc.lines[0].amount).toBe(formatMoney(1000, 'USD'));
    expect(doc.summary.find((r) => r.label.startsWith('Subtotal'))?.value).toBe(formatMoney(1000, 'USD'));
    expect(doc.summary.find((r) => r.label.startsWith('Tax'))?.value).toBe(formatMoney(77, 'USD'));
    expect(doc.total.value).toBe(formatMoney(1077, 'USD'));
  });

  it.each([
    ['preview', () => previewText(doc)],
    ['PDF', () => pdfText(doc)],
  ])('%s text shows stored values and none of the recomputed ones', (_n, text) => {
    const t = text();
    for (const stored of [1000, 77, 1077]) expect(t).toContain(usd(stored));
    for (const recomputed of [1234.5, 123.45, 1357.95]) expect(t).not.toContain(usd(recomputed));
  });
});

describe('draft with the same lines still recomputes (AC-09)', () => {
  it('prints the recomputed amounts', () => {
    const doc = buildInvoiceDocument({ kind: 'draft', form, parties });
    expect(doc.lines[0].amount).toBe(formatMoney(1234.5, 'USD'));
    expect(doc.total.value).toBe(formatMoney(1357.95, 'USD'));
  });
});
