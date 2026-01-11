'use client';

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Link,
  Font,
} from '@react-pdf/renderer';
import {
  InvoiceFormData,
  InvoiceSenderProfile,
  InvoiceCustomer,
  InvoiceBankAccount,
} from '@/types/invoice/types';
import { siteConfig } from '@/config/site.config';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
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
  watermark: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 10,
    right: 40,
    fontSize: 8,
    color: '#9ca3af',
  },
  watermarkLink: {
    color: '#6b7280',
    textDecoration: 'none',
  },
});

interface InvoicePDFDocumentProps {
  formData: InvoiceFormData;
  senderProfile?: InvoiceSenderProfile;
  customer?: InvoiceCustomer;
  bankAccount?: InvoiceBankAccount;
  subtotal: number;
  taxAmount: number;
  total: number;
  logoBase64?: string | null;
}

export function InvoicePDFDocument({
  formData,
  senderProfile,
  customer,
  bankAccount,
  subtotal,
  taxAmount,
  total,
  logoBase64,
}: InvoicePDFDocumentProps) {
  const logoSrc =
    logoBase64 ||
    (senderProfile?.logo?.startsWith('data:') ? senderProfile.logo : null);

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
              <Text style={styles.title}>INVOICE</Text>
              <Text style={styles.invoiceNumber}>{formData.invoiceNumber}</Text>
            </View>
          </View>

          <View style={{ textAlign: 'right' }}>
            <Text>
              Date: {format(formData.issueDate, 'dd.MM.yyyy', { locale: enUS })}
            </Text>
            <Text>
              Due: {format(formData.dueDate, 'dd.MM.yyyy', { locale: enUS })}
            </Text>
            {formData.poNumber && <Text>PO: {formData.poNumber}</Text>}
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
            <Text style={styles.sectionTitle}>From</Text>
            {senderProfile && (
              <>
                <Text style={styles.textBold}>{senderProfile.name}</Text>
                {senderProfile.address && (
                  <Text style={styles.textMuted}>{senderProfile.address}</Text>
                )}
                {(senderProfile.city || senderProfile.country) && (
                  <Text style={styles.textMuted}>
                    {[senderProfile.city, senderProfile.country]
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                )}
                {senderProfile.email && (
                  <Text style={styles.textMuted}>{senderProfile.email}</Text>
                )}
                {senderProfile.taxId && (
                  <Text style={styles.textMuted}>
                    Tax ID: {senderProfile.taxId}
                  </Text>
                )}
              </>
            )}
          </View>
          <View style={[styles.addressBlock, { textAlign: 'right' }]}>
            <Text style={styles.sectionTitle}>To</Text>
            {customer && (
              <>
                <Text style={styles.textBold}>{customer.name}</Text>
                {customer.address && (
                  <Text style={styles.textMuted}>{customer.address}</Text>
                )}
                {(customer.city || customer.country) && (
                  <Text style={styles.textMuted}>
                    {[customer.city, customer.country]
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                )}
                {customer.email && (
                  <Text style={styles.textMuted}>{customer.email}</Text>
                )}
                {customer.taxId && (
                  <Text style={styles.textMuted}>Tax ID: {customer.taxId}</Text>
                )}
              </>
            )}
          </View>
        </View>

        {/* Table Header - fixed on every page */}
        <View style={styles.tableHeader} fixed>
          <Text style={styles.colProduct}>Product / Service</Text>
          <Text style={styles.colPrice}>Price</Text>
          <Text style={styles.colQty}>Qty</Text>
          <Text style={styles.colTotal}>Amount</Text>
        </View>

        {/* Items - will wrap automatically */}
        <View style={styles.table}>
          {formData.items.map((item, index) => (
            <View key={index} style={styles.tableRow} wrap={false}>
              <View style={styles.colProduct}>
                <Text>{item.productName || 'Untitled'}</Text>
                {item.description && item.productId !== 'custom' && (
                  <Text style={styles.textMuted}>{item.description}</Text>
                )}
              </View>
              <Text style={styles.colPrice}>
                {item.price.toFixed(2)} {formData.currency}
              </Text>
              <Text style={styles.colQty}>
                {item.quantity}
                {item.productId !== 'custom' && ` ${item.unit}`}
              </Text>
              <Text style={styles.colTotal}>
                {item.total.toFixed(2)} {formData.currency}
              </Text>
            </View>
          ))}
        </View>

        {/* Summary */}
        <View style={styles.summary} wrap={false}>
          <View style={styles.summaryRow}>
            <Text>Subtotal:</Text>
            <Text>
              {subtotal.toFixed(2)} {formData.currency}
            </Text>
          </View>
          {formData.discount > 0 && (
            <View style={styles.summaryRow}>
              <Text>Discount:</Text>
              <Text>
                -{formData.discount.toFixed(2)} {formData.currency}
              </Text>
            </View>
          )}
          {formData.shipping > 0 && (
            <View style={styles.summaryRow}>
              <Text>Shipping:</Text>
              <Text>
                +{formData.shipping.toFixed(2)} {formData.currency}
              </Text>
            </View>
          )}
          {formData.taxRate > 0 && (
            <View style={styles.summaryRow}>
              <Text>Tax ({formData.taxRate}%):</Text>
              <Text>
                {taxAmount.toFixed(2)} {formData.currency}
              </Text>
            </View>
          )}
          <View style={styles.summaryTotal}>
            <Text>TOTAL:</Text>
            <Text>
              {total.toFixed(2)} {formData.currency}
            </Text>
          </View>
        </View>

        {/* Footer Content */}
        <View style={styles.footer} wrap={false}>
          {formData.notes && (
            <View style={styles.notes}>
              <Text style={styles.sectionTitle}>Notes</Text>
              <Text style={styles.textMuted}>{formData.notes}</Text>
            </View>
          )}
          {formData.terms && (
            <View style={styles.notes}>
              <Text style={styles.sectionTitle}>Payment Terms</Text>
              <Text style={styles.textMuted}>{formData.terms}</Text>
            </View>
          )}
          {bankAccount && (
            <View style={styles.bankInfo}>
              <Text style={styles.sectionTitle}>Payment Information</Text>
              <Text>{bankAccount.bankName}</Text>
              <Text>{bankAccount.accountName}</Text>
              {bankAccount.iban && <Text>IBAN: {bankAccount.iban}</Text>}
              {bankAccount.swift && <Text>SWIFT: {bankAccount.swift}</Text>}
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

        {/* Watermark */}
        {siteConfig.branding.website && (
          <View style={styles.watermark} fixed>
            <Text>
              Created with{' '}
              <Link
                src={siteConfig.branding.website}
                style={styles.watermarkLink}
              >
                {siteConfig.branding.website}
              </Link>
            </Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
