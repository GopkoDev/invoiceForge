'use client';

import { createElement, useCallback, useState } from 'react';
import { toast } from 'sonner';
import * as Sentry from '@sentry/nextjs';
import { loadPdfKit, PdfKitLoadError } from '@/lib/pdf/load-pdf-kit';
import {
  prepareInvoiceDataForPdf,
  resolveLogoForPdf,
} from '@/lib/helpers/invoice-pdf-helpers';
import { siteConfig } from '@/config/site.config';
import { buildInvoiceDocument, type InvoiceDocument } from '@/lib/invoice-document';
import type { InvoiceSenderProfile, SerializedInvoice } from '@/types/invoice/types';

export type PdfAction = 'download' | 'print' | 'preview';

export interface PdfActionResult {
  success: boolean;
  blob?: Blob;
  unauthorized?: boolean;
}

/** What the PDF is printed from: the document model, plus the sender profile only for its logo. */
export interface PdfInput {
  document: InvoiceDocument;
  senderProfile?: InvoiceSenderProfile;
}

const COULD_NOT_PREPARE = 'The PDF could not be prepared.';
const NEWER_VERSION = 'A newer version of the app is available.';

async function execute(action: PdfAction, input: PdfInput): Promise<PdfActionResult> {
  const kit = await loadPdfKit();
  const logo = await resolveLogoForPdf(input.senderProfile);
  if (logo.unauthorized) return { success: false, unauthorized: true };

  const doc = createElement(kit.InvoicePdfDocument, {
    document: input.document,
    logoBase64: logo.logoBase64,
  });
  const blob = await kit.generatePdfBlob(doc);
  if (logo.warning) toast.warning(logo.warning);

  if (action === 'download') {
    kit.downloadPdf(
      blob,
      `${input.document.invoiceNumber || 'invoice'}(${siteConfig.branding.domain}).pdf`
    );
    toast.success('PDF downloaded');
    return { success: true };
  }
  if (action === 'print') {
    kit.printPdf(blob);
    return { success: true };
  }
  return { success: true, blob };
}

/**
 * The one entry point for every PDF trigger (ADR-0001): fetches the toolkit through the cached
 * loader, owns the preparing / try-again / newer-version states and reports failures to Sentry.
 */
export function usePdfAction() {
  const [pending, setPending] = useState(0);

  const runInput = useCallback(async function runInput(
    action: PdfAction,
    input: PdfInput
  ): Promise<PdfActionResult> {
    setPending((n) => n + 1);
    try {
      return await execute(action, input);
    } catch (error) {
      const retry = { label: 'Try again', onClick: () => void runInput(action, input) };
      if (error instanceof PdfKitLoadError && error.kind === 'new-version') {
        Sentry.captureException(error, { tags: { 'pdf.stage': 'version' } });
        toast.error(NEWER_VERSION, {
          action: { label: 'Reload', onClick: () => window.location.reload() },
        });
      } else if (error instanceof PdfKitLoadError) {
        toast.error(COULD_NOT_PREPARE, { action: retry });
      } else {
        Sentry.captureException(error, { tags: { 'pdf.stage': 'generate' } });
        toast.error(COULD_NOT_PREPARE, { action: retry });
      }
      return { success: false };
    } finally {
      setPending((n) => n - 1);
    }
  }, []);

  const run = useCallback(
    (action: PdfAction, invoice: SerializedInvoice) => {
      const data = prepareInvoiceDataForPdf(invoice);
      return runInput(action, {
        document: buildInvoiceDocument({ kind: 'issued', invoice }),
        senderProfile: data.senderProfile ?? undefined,
      });
    },
    [runInput]
  );

  return { run, runInput, preparing: pending > 0 };
}
