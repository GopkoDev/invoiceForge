import { format } from 'date-fns';
import {
  InvoiceFormData,
  InvoiceSenderProfile,
  InvoiceCustomer,
  InvoiceBankAccount,
} from '@/types/invoice/types';

interface PDFPreviewDocumentProps {
  logoSrc?: string;
  senderProfile: InvoiceSenderProfile | undefined;
  customer: InvoiceCustomer | undefined;
  bankAccount: InvoiceBankAccount | undefined;
  formData: InvoiceFormData;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export function PDFPreviewDocument({
  logoSrc,
  senderProfile,
  customer,
  bankAccount,
  formData,
  subtotal,
  taxAmount,
  total,
}: PDFPreviewDocumentProps) {
  return (
    <div className="relative p-10 text-sm">
      {/* Header */}
      <div className="mb-8 flex justify-between">
        <div className="flex items-start gap-4">
          {logoSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt="Logo"
              className="h-16 w-16 object-contain"
              loading="eager"
              decoding="sync"
            />
          )}
          <div>
            <h1 className="mb-1 text-3xl font-bold">INVOICE</h1>
            <p className="text-muted-foreground">{formData.invoiceNumber}</p>
          </div>
        </div>
        <div className="text-muted-foreground text-right">
          <p>Date: {format(formData.issueDate, 'dd.MM.yyyy')}</p>
          <p>Due: {format(formData.dueDate, 'dd.MM.yyyy')}</p>
          {formData.poNumber && <p>PO: {formData.poNumber}</p>}
        </div>
      </div>

      {/* From / To */}
      <div className="mb-8 grid grid-cols-2 gap-8">
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
            From
          </p>
          {senderProfile && (
            <>
              <p className="font-semibold">{senderProfile.name}</p>
              {senderProfile.address && (
                <p className="text-muted-foreground">{senderProfile.address}</p>
              )}
              {(senderProfile.city || senderProfile.country) && (
                <p className="text-muted-foreground">
                  {[senderProfile.city, senderProfile.country]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              )}
              {senderProfile.email && (
                <p className="text-muted-foreground">{senderProfile.email}</p>
              )}
              {senderProfile.taxId && (
                <p className="text-muted-foreground">
                  Tax ID: {senderProfile.taxId}
                </p>
              )}
            </>
          )}
        </div>
        <div className="text-right">
          <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
            To
          </p>
          {customer && (
            <>
              <p className="font-semibold">{customer.name}</p>
              {customer.address && (
                <p className="text-muted-foreground">{customer.address}</p>
              )}
              {(customer.city || customer.country) && (
                <p className="text-muted-foreground">
                  {[customer.city, customer.country].filter(Boolean).join(', ')}
                </p>
              )}
              {customer.email && (
                <p className="text-muted-foreground">{customer.email}</p>
              )}
              {customer.taxId && (
                <p className="text-muted-foreground">
                  Tax ID: {customer.taxId}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Items Table */}
      <table className="mb-8 w-full">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="p-2 text-left">Product / Service</th>
            <th className="p-2 text-right">Price</th>
            <th className="p-2 text-center">Qty</th>
            <th className="p-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {formData.items.map((item, index) => (
            <tr key={index} className="border-b">
              <td className="max-w-50 p-2">
                <p className="line-clamp-2 overflow-hidden break-all text-ellipsis">
                  {item.productName || 'Untitled'}
                </p>
                {item.description && item.productId !== 'custom' && (
                  <p className="text-muted-foreground line-clamp-2 overflow-hidden text-xs break-all text-ellipsis">
                    {item.description}
                  </p>
                )}
              </td>
              <td className="p-2 text-right">
                {item.price.toFixed(2)} {formData.currency}
              </td>
              <td className="p-2 text-center">
                {item.quantity}
                {item.productId !== 'custom' && ` ${item.unit}`}
              </td>
              <td className="p-2 text-right">
                {item.total.toFixed(2)} {formData.currency}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div className="mb-8 flex justify-end">
        <div className="w-64">
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Subtotal:</span>
            <span>
              {subtotal.toFixed(2)} {formData.currency}
            </span>
          </div>
          {formData.discount > 0 && (
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Discount:</span>
              <span>
                -{formData.discount.toFixed(2)} {formData.currency}
              </span>
            </div>
          )}
          {formData.shipping > 0 && (
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Shipping:</span>
              <span>
                +{formData.shipping.toFixed(2)} {formData.currency}
              </span>
            </div>
          )}
          {formData.taxRate > 0 && (
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">
                Tax ({formData.taxRate}%):
              </span>
              <span>
                {taxAmount.toFixed(2)} {formData.currency}
              </span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t-2 py-2 text-lg font-bold">
            <span>TOTAL:</span>
            <span>
              {total.toFixed(2)} {formData.currency}
            </span>
          </div>
        </div>
      </div>

      {/* Notes & Terms */}
      {(formData.notes || formData.terms) && (
        <div className="space-y-4 border-t pt-4">
          {formData.notes && (
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                Notes
              </p>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {formData.notes}
              </p>
            </div>
          )}
          {formData.terms && (
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                Payment Terms
              </p>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {formData.terms}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Bank Info */}
      {bankAccount && (
        <div className="bg-muted/30 mt-6 rounded p-4">
          <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
            Payment Information
          </p>
          <p>{bankAccount.bankName}</p>
          <p>{bankAccount.accountName}</p>
          {bankAccount.iban && <p>IBAN: {bankAccount.iban}</p>}
          {bankAccount.swift && <p>SWIFT: {bankAccount.swift}</p>}
        </div>
      )}

      {/* Website watermark */}
      {/* {siteConfig.branding.website && (
        <div className="text-muted-foreground mt-8 text-center text-xs">
          Created with{' '}
          <a
            href={siteConfig.branding.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {siteConfig.branding.website}
          </a>
        </div>
      )} */}
    </div>
  );
}
