'use client';

import { createElement, useCallback, useState } from 'react';
import { toast } from 'sonner';
import * as Sentry from '@sentry/nextjs';
import { loadPdfKit, PdfKitLoadError } from '@/lib/pdf/load-pdf-kit';
import {
  prepareInvoiceDataForPdf,
  resolveLogoForPdf,
} from '@/lib/helpers/invoice-pdf-helpers';
import { goToSignIn } from '@/lib/helpers/client-session-redirect';
import { siteConfig } from '@/config/site.config';
import { buildInvoiceDocument, type InvoiceDocument } from '@/lib/invoice-document';
import type { InvoiceSenderProfile, SerializedInvoice } from '@/types/invoice/types';

export type PdfAction = 'download' | 'print';

export interface PdfActionResult {
  success: boolean;
  unauthorized?: boolean;
}

/** What the PDF is printed from: the document model, plus the sender profile only for its logo. */
export interface PdfInput {
  document: InvoiceDocument;
  senderProfile?: InvoiceSenderProfile;
}

/** A PdfInput, or a thunk that builds it: built inside runInput's try so a model error is handled. */
export type PdfInputSource = PdfInput | (() => PdfInput);

export interface PdfRunOptions {
  /**
   * The print window, opened synchronously in the click (a popup blocker only allows that). Left out,
   * runInput opens it itself before its first await; a caller that awaits before running opens it
   * first and passes it here, null when the browser blocked it.
   */
  printWindow?: Window | null;
}

const COULD_NOT_PREPARE = 'The PDF could not be prepared.';
const NEWER_VERSION = 'A newer version of the app is available.';
const PRINT_BLOCKED = 'Your browser blocked the print window.';

/** Opens the (blank) print window. Call it synchronously from the click handler. */
export function openPrintWindow(): Window | null {
  return window.open('', '_blank') ?? null;
}

async function execute(
  action: PdfAction,
  input: PdfInput,
  printWindow: Window | null
): Promise<PdfActionResult> {
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
  // printWindow is set here: a blocked window never reaches execute.
  kit.printPdf(blob, printWindow as Window);
  return { success: true };
}

/**
 * The one entry point for every PDF trigger (ADR-0001): fetches the toolkit through the cached
 * loader, owns the preparing / try-again / newer-version states and reports failures to Sentry.
 */
export function usePdfAction() {
  const [pending, setPending] = useState(0);

  const runInput = useCallback(async function runInput(
    action: PdfAction,
    source: PdfInputSource,
    options?: PdfRunOptions
  ): Promise<PdfActionResult> {
    // Before the first await, so it still counts as the click's own window.open.
    const printWindow =
      action !== 'print' ? null : options && 'printWindow' in options ? options.printWindow ?? null : openPrintWindow();
    // Built once, even across Try again.
    let built: PdfInput | undefined;
    const getInput = () => (built ??= typeof source === 'function' ? source() : source);

    const again = (next: PdfAction) =>
      void runInput(next, getInput).then((result) => {
        if (result.unauthorized) goToSignIn();
      });

    setPending((n) => n + 1);
    try {
      if (action === 'print' && !printWindow) {
        toast.error(PRINT_BLOCKED, {
          action: { label: 'Download PDF', onClick: () => again('download') },
        });
        return { success: false };
      }
      const result = await execute(action, getInput(), printWindow);
      if (!result.success) printWindow?.close();
      return result;
    } catch (error) {
      printWindow?.close();
      const retry = {
        label: 'Try again',
        onClick: () => again(action),
      };
      if (error instanceof PdfKitLoadError) {
        Sentry.captureException(error, { tags: { 'pdf.stage': 'fetch' } });
        if (error.kind === 'new-version') {
          toast.error(NEWER_VERSION, {
            action: { label: 'Reload', onClick: () => window.location.reload() },
          });
        } else {
          toast.error(COULD_NOT_PREPARE, { action: retry });
        }
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
    (action: PdfAction, invoice: SerializedInvoice, options?: PdfRunOptions) =>
      runInput(
        action,
        () => {
          const data = prepareInvoiceDataForPdf(invoice);
          return {
            document: buildInvoiceDocument({ kind: 'issued', invoice }),
            senderProfile: data.senderProfile ?? undefined,
          };
        },
        options
      ),
    [runInput]
  );

  return { run, runInput, preparing: pending > 0 };
}
