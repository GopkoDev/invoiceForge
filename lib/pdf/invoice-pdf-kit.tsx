'use client';

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
  pdf,
} from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { InvoiceDocument } from '@/lib/invoice-document';
import { PDF_FONTS, PDF_COLORS } from '@/config/pdf-config';

Font.register({
  family: PDF_FONTS.FAMILY,
  fonts: [
    {
      src: PDF_FONTS.URLS.REGULAR,
      fontWeight: 'normal',
    },
    {
      src: PDF_FONTS.URLS.BOLD,
      fontWeight: 'bold',
    },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: PDF_FONTS.FAMILY,
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 15,
  },
  logo: {
    width: 60,
    height: 60,
    objectFit: 'contain',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  invoiceNumber: {
    fontSize: 12,
    color: '#666',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
    textTransform: 'uppercase',
  },
  addressBlock: {
    maxWidth: 200,
  },
  textMuted: {
    color: '#666',
  },
  textBold: {
    fontWeight: 'bold',
  },
  table: {
    marginTop: 10,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: PDF_COLORS.BG_HEADER,
    padding: 8,
    fontWeight: 'bold',
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.BORDER,
  },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.BORDER,
  },
  colProduct: {
    flex: 2,
    maxWidth: '40%',
    overflow: 'hidden',
  },
  colPrice: { flex: 1, textAlign: 'right' },
  colQty: { flex: 0.5, textAlign: 'center' },
  colTotal: { flex: 1, textAlign: 'right' },
  summary: {
    marginLeft: 'auto',
    width: 200,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 2,
    borderTopColor: '#333',
    marginTop: 5,
    fontWeight: 'bold',
    fontSize: 12,
  },
  footer: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.BORDER,
  },
  notes: {
    marginBottom: 15,
  },
  bankInfo: {
    backgroundColor: PDF_COLORS.BG_BANK_INFO,
    padding: 10,
    borderRadius: 4,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 10,
    right: 40,
    fontSize: 8,
    color: '#9ca3af',
  },
});

interface InvoicePDFDocumentProps {
  document: InvoiceDocument;
  logoBase64?: string | null;
}

// ADR-0002: lays out the InvoiceDocument model only; wording, days and amounts come from the model.
export function InvoicePDFDocument({ document, logoBase64 }: InvoicePDFDocumentProps) {
  const logoSrc = logoBase64 || null;

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/* Header - fixed on first page */}
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            {logoSrc && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoSrc} style={styles.logo} cache={false} />
            )}

            <View>
              <Text style={styles.title}>{document.title}</Text>
              <Text style={styles.invoiceNumber}>{document.invoiceNumber}</Text>
            </View>
          </View>

          <View style={{ textAlign: 'right' }}>
            {document.meta.map((row) => (
              <Text key={row.label}>
                {row.label} {row.value}
              </Text>
            ))}
          </View>
        </View>

        {/* From / To - fixed on every page */}
        <View
          style={[
            styles.section,
            { flexDirection: 'row', justifyContent: 'space-between' },
          ]}
          fixed
        >
          <View style={styles.addressBlock}>
            <Text style={styles.sectionTitle}>{document.from.title}</Text>
            {document.from.lines.map((line, index) => (
              <Text key={index} style={index === 0 ? styles.textBold : styles.textMuted}>
                {line}
              </Text>
            ))}
          </View>
          <View style={[styles.addressBlock, { textAlign: 'right' }]}>
            <Text style={styles.sectionTitle}>{document.to.title}</Text>
            {document.to.lines.map((line, index) => (
              <Text key={index} style={index === 0 ? styles.textBold : styles.textMuted}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        {/* Table Header - fixed on every page */}
        <View style={styles.tableHeader} fixed>
          <Text style={styles.colProduct}>{document.columns.product}</Text>
          <Text style={styles.colPrice}>{document.columns.price}</Text>
          <Text style={styles.colQty}>{document.columns.quantity}</Text>
          <Text style={styles.colTotal}>{document.columns.amount}</Text>
        </View>

        {/* Items - will wrap automatically */}
        <View style={styles.table}>
          {document.lines.map((line, index) => (
            <View key={index} style={styles.tableRow} wrap={false}>
              <View style={styles.colProduct}>
                <Text>{line.name}</Text>
                {line.description && <Text style={styles.textMuted}>{line.description}</Text>}
              </View>
              <Text style={styles.colPrice}>{line.price}</Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colTotal}>{line.amount}</Text>
            </View>
          ))}
        </View>

        {/* Summary */}
        <View style={styles.summary} wrap={false}>
          {document.summary.map((row) => (
            <View key={row.label} style={styles.summaryRow}>
              <Text>{row.label}</Text>
              <Text>{row.value}</Text>
            </View>
          ))}
          <View style={styles.summaryTotal}>
            <Text>{document.total.label}</Text>
            <Text>{document.total.value}</Text>
          </View>
        </View>

        {/* Footer Content */}
        <View style={styles.footer} wrap={false}>
          {document.notes && (
            <View style={styles.notes}>
              <Text style={styles.sectionTitle}>{document.notes.title}</Text>
              <Text style={styles.textMuted}>{document.notes.text}</Text>
            </View>
          )}
          {document.terms && (
            <View style={styles.notes}>
              <Text style={styles.sectionTitle}>{document.terms.title}</Text>
              <Text style={styles.textMuted}>{document.terms.text}</Text>
            </View>
          )}
          {document.bank && (
            <View style={styles.bankInfo}>
              <Text style={styles.sectionTitle}>{document.bank.title}</Text>
              {document.bank.lines.map((line, index) => (
                <Text key={index}>{line}</Text>
              ))}
            </View>
          )}
        </View>

        {/* Page number */}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

export { InvoicePDFDocument as InvoicePdfDocument };

/** Renders a react-pdf document element to a Blob. */
export async function generatePdfBlob(doc: ReactElement): Promise<Blob> {
  return pdf(doc as Parameters<typeof pdf>[0]).toBlob();
}

/** Saves a PDF blob through a temporary download link. */
export function downloadPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Prints a PDF blob in the window that was opened synchronously in the click (a popup blocker
 * would stop a window opened after the awaits). The object URL is always revoked: once the window
 * has loaded, or after a minute at the latest.
 */
export function printPdf(blob: Blob, printWindow: Window): void {
  const url = URL.createObjectURL(blob);
  const revoke = () => URL.revokeObjectURL(url);
  try {
    printWindow.location.href = url;
    printWindow.addEventListener('load', () => {
      printWindow.focus();
      printWindow.print();
      revoke();
    });
    setTimeout(revoke, 60_000);
  } catch (error) {
    revoke();
    throw error;
  }
}
