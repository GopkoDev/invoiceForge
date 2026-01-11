/**
 * Unified PDF Configuration
 * Shared constants and dimensions for PDF generation and HTML preview
 */

// ============================================================
// Page Dimensions (A4)
// ============================================================
export const PDF_PAGE = {
  // A4 dimensions in mm
  WIDTH_MM: 210,
  HEIGHT_MM: 297,

  // Conversion factor: 1mm = ~3.78px at 96dpi
  MM_TO_PX: 3.7795275591,

  // Page padding in mm (same as react-pdf padding: 40px at 72dpi ≈ 14mm)
  PADDING_MM: 14,

  // Get page dimensions in pixels
  get WIDTH_PX() {
    return this.WIDTH_MM * this.MM_TO_PX;
  },
  get HEIGHT_PX() {
    return this.HEIGHT_MM * this.MM_TO_PX;
  },
  get PADDING_PX() {
    return this.PADDING_MM * this.MM_TO_PX;
  },
  get CONTENT_WIDTH_PX() {
    return this.WIDTH_PX - this.PADDING_PX * 2;
  },
  get CONTENT_HEIGHT_PX() {
    return this.HEIGHT_PX - this.PADDING_PX * 2;
  },
} as const;

// ============================================================
// Font Configuration
// ============================================================
export const PDF_FONTS = {
  FAMILY: 'Roboto',
  // Font sizes in points (for react-pdf) / pixels (for HTML)
  SIZE: {
    TITLE: 24,
    SUBTITLE: 12,
    BODY: 10,
    SMALL: 8,
  },
  // Font URLs for react-pdf
  URLS: {
    REGULAR:
      'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf',
    BOLD: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf',
  },
} as const;

// ============================================================
// Colors
// ============================================================
export const PDF_COLORS = {
  // Text colors
  TEXT_PRIMARY: '#000000',
  TEXT_SECONDARY: '#666666',
  TEXT_MUTED: '#9ca3af',

  // Background colors
  BG_HEADER: '#f3f4f6',
  BG_BANK_INFO: '#f9fafb',

  // Border colors
  BORDER: '#e5e7eb',
  BORDER_STRONG: '#333333',
} as const;
