'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  InvoiceFormData,
  InvoiceSenderProfile,
  InvoiceCustomer,
  InvoiceBankAccount,
} from '@/types/invoice/types';
import { ZoomIn, ZoomOut, Maximize, AlertTriangle } from 'lucide-react';
import { PDF_PAGE } from '@/config/pdf-config';
import { PDFPreviewDocument } from './pdf-preview-document';
import { fetchLogoDataUrl } from '@/lib/utils/image-to-base64';

interface PDFPreviewPanelProps {
  formData: InvoiceFormData;
  senderProfile?: InvoiceSenderProfile;
  customer?: InvoiceCustomer;
  bankAccount?: InvoiceBankAccount;
  subtotal: number;
  taxAmount: number;
  total: number;
}

const PAGE_WIDTH_PX = PDF_PAGE.WIDTH_PX;
const PAGE_MIN_HEIGHT_PX = PDF_PAGE.HEIGHT_PX;

const MAX_ZOOM = 200;
const MIN_ZOOM = 25;
const ZOOM_STEP = 25;

export function PDFPreviewPanel({
  formData,
  senderProfile,
  customer,
  bankAccount,
  subtotal,
  taxAmount,
  total,
}: PDFPreviewPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [fitScale, setFitScale] = useState(1);
  const [pageHeight, setPageHeight] = useState(PAGE_MIN_HEIGHT_PX);
  const [logoSrc, setLogoSrc] = useState<string | undefined>(undefined);
  const [logoWarning, setLogoWarning] = useState<string | undefined>(
    undefined
  );

  const senderProfileId = senderProfile?.id;
  const senderProfileLogo = senderProfile?.logo;

  // Fetches the sender profile's logo by id (never a URL) - SCR-04 no-logo-set/with-logo/
  // warn-specific/warn-generic. `fetchLogoDataUrl` caches successes for the session, so a
  // second render with the same profile id makes no request (edge case table).
  useEffect(() => {
    let cancelled = false;

    async function loadLogo() {
      if (!senderProfileId || !senderProfileLogo) {
        return { logoSrc: undefined, logoWarning: undefined };
      }

      const result = await fetchLogoDataUrl(senderProfileId, senderProfileLogo);

      if ('dataUrl' in result) {
        return { logoSrc: result.dataUrl, logoWarning: undefined };
      }
      if ('warning' in result) {
        return { logoSrc: undefined, logoWarning: result.warning };
      }
      // unauthorized: the preview still renders without the logo; the download/print path
      // (hooks/use-invoice-pdf.tsx, invoice-pdf-preview-modal.tsx) owns the SCR-01 redirect.
      return { logoSrc: undefined, logoWarning: undefined };
    }

    loadLogo().then(({ logoSrc, logoWarning }) => {
      if (cancelled) return;
      setLogoSrc(logoSrc);
      setLogoWarning(logoWarning);
    });

    return () => {
      cancelled = true;
    };
  }, [senderProfileId, senderProfileLogo]);

  // Calculate fit scale based on container width
  const calculateFitScale = useCallback(() => {
    if (!containerRef.current) return 1;

    const container = containerRef.current;
    // Account for padding (16px on each side)
    const availableWidth = container.clientWidth - 32;

    // Scale to fit width, max 1 (never scale up)
    return Math.min(availableWidth / PAGE_WIDTH_PX, 1);
  }, []);

  // Update fit scale on container resize
  useEffect(() => {
    const updateFitScale = () => {
      const newFitScale = calculateFitScale();
      setFitScale(newFitScale);
    };

    updateFitScale();

    const resizeObserver = new ResizeObserver(() => {
      updateFitScale();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [calculateFitScale]);

  // Track actual page height for proper scaling
  useEffect(() => {
    if (!pageRef.current) return;

    const updatePageHeight = () => {
      if (pageRef.current) {
        const actualHeight = pageRef.current.scrollHeight;
        setPageHeight(Math.max(actualHeight, PAGE_MIN_HEIGHT_PX));
      }
    };

    updatePageHeight();

    const resizeObserver = new ResizeObserver(updatePageHeight);
    resizeObserver.observe(pageRef.current);

    return () => resizeObserver.disconnect();
  }, [formData]);

  const currentScale = zoom === 'fit' ? fitScale : zoom / 100;
  const scaledWidth = PAGE_WIDTH_PX * currentScale;
  const scaledHeight = pageHeight * currentScale;

  const handleZoomIn = () => {
    const currentPercent = zoom === 'fit' ? Math.round(fitScale * 100) : zoom;
    const newZoom = Math.min(currentPercent + ZOOM_STEP, MAX_ZOOM);
    setZoom(newZoom);
  };

  const handleZoomOut = () => {
    const currentPercent = zoom === 'fit' ? Math.round(fitScale * 100) : zoom;
    const newZoom = Math.max(currentPercent - ZOOM_STEP, MIN_ZOOM);
    setZoom(newZoom);
  };

  const handleFitToSize = () => {
    setZoom('fit');
  };

  const isNotFit = zoom !== 'fit';
  const displayZoom =
    zoom === 'fit' ? `${Math.round(fitScale * 100)}%` : `${zoom}%`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="bg-background z-10 flex shrink-0 items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleZoomOut}
            disabled={zoom !== 'fit' && zoom <= MIN_ZOOM}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>

          <span className="w-14 text-center text-sm font-medium">
            {displayZoom}
          </span>

          <Button
            variant="outline"
            size="icon"
            onClick={handleZoomIn}
            disabled={zoom !== 'fit' && zoom >= MAX_ZOOM}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

          {isNotFit && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleFitToSize}
              className="ml-2"
            >
              <Maximize className="mr-1.5 h-4 w-4" />
              Fit
            </Button>
          )}
        </div>
      </div>

      {logoWarning && (
        <Alert variant="destructive" className="shrink-0 rounded-none border-x-0 border-t-0">
          <AlertTriangle />
          <AlertDescription>
            {logoWarning} The PDF was made without it.
          </AlertDescription>
        </Alert>
      )}

      {/* Preview Area with scroll */}
      <div
        ref={containerRef}
        className="bg-muted/50 relative min-h-0 flex-1 overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
      >
        {/* Inner content - sized to enable scrolling when zoomed */}
        <div
          className="inline-block p-4"
          style={{
            minWidth: '100%',
          }}
        >
          {/* Centering wrapper */}
          <div
            className="flex justify-center"
            style={{
              minWidth: scaledWidth,
            }}
          >
            {/* Scaled wrapper - matches the visual size after transform */}
            <div
              style={{
                width: scaledWidth,
                height: scaledHeight,
                flexShrink: 0,
              }}
            >
              {/* Page container - fixed A4 width, transforms from top-left */}
              <div
                ref={pageRef}
                className="bg-background shadow-lg"
                style={{
                  width: PAGE_WIDTH_PX,
                  minHeight: PAGE_MIN_HEIGHT_PX,
                  transform: `scale(${currentScale})`,
                  transformOrigin: 'top left',
                  fontFamily: 'var(--font-roboto), sans-serif',
                }}
              >
                {/* Page Content */}
                <PDFPreviewDocument
                  logoSrc={logoSrc}
                  formData={formData}
                  senderProfile={senderProfile}
                  customer={customer}
                  bankAccount={bankAccount}
                  subtotal={subtotal}
                  taxAmount={taxAmount}
                  total={total}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
