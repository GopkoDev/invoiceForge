// @vitest-environment jsdom
// editor-ux T10 (AC-10) — "A wording change made to the invoice layout appears in both, never in only one":
// the title changed in lib/invoice-document/wording.ts must show in the preview and the PDF alike.
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/invoice-document/wording', async (orig) => {
  const actual = await orig<typeof import('@/lib/invoice-document/wording')>();
  return { ...actual, WORDING: { ...actual.WORDING, title: 'FACTURE', total: 'GRAND TOTAL:' } };
});

import { PDFPreviewDocument } from '@/components/invoice-editor/pdf-preview-document';
import { buildInvoiceDocument } from '@/lib/invoice-document';
const { InvoicePDFDocument } = await import('@/lib/pdf/invoice-pdf-kit');
import { pdfTextRuns } from '../support/pdf-text';
import { makeForm, parties } from '../support/invoice-document-fixtures';

describe('a wording change reaches both layouts', () => {
  const document = buildInvoiceDocument({ kind: 'draft', form: makeForm(), parties });
  const preview = render(createElement(PDFPreviewDocument as never, { document } as never)).container.textContent ?? '';
  const pdf = pdfTextRuns(createElement(InvoicePDFDocument as never, { document } as never)).join(' ');

  it.each([['preview', preview], ['PDF', pdf]])('%s prints the changed wording and no old literal', (_n, text) => {
    expect(text).toContain('FACTURE');
    expect(text).toContain('GRAND TOTAL:');
    expect(text).not.toMatch(/INVOICE|TOTAL:(?<!GRAND TOTAL:)/);
  });
});
