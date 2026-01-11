'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  InvoiceFormData,
  InvoiceSenderProfile,
  InvoiceCustomer,
  InvoiceBankAccount,
} from '@/types/invoice/types';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { PDF_PAGE } from '@/config/pdf-config';
import { PDFPreviewDocument } from './pdf-preview-document';

interface PDFPreviewPanelProps {
  formData: InvoiceFormData;
  senderProfile?: InvoiceSenderProfile;
  customer?: InvoiceCustomer;
  bankAccount?: InvoiceBankAccount;
  subtotal: number;
  taxAmount: number;
  total: number;
}

// Check if logo is a valid URL
const isValidLogoUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:')
  );
};

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

  const logoSrc =
    senderProfile?.logo && isValidLogoUrl(senderProfile.logo)
      ? senderProfile.logo
      : undefined;

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
