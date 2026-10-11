import type { InvoiceDocument } from '@/lib/invoice-document';

interface PDFPreviewDocumentProps {
  document: InvoiceDocument;
  logoSrc?: string;
}

// ADR-0002: lays out the InvoiceDocument model only. Every label, day and amount comes from the model;
// this file holds no wording and does no formatting of its own.
export function PDFPreviewDocument({ document, logoSrc }: PDFPreviewDocumentProps) {
  return (
    <div className="relative p-10 text-sm">
      {/* Header */}
      <div className="mb-8 flex justify-between">
        <div className="flex items-start gap-4">
          {logoSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt=""
              className="h-16 w-16 object-contain"
              loading="eager"
              decoding="sync"
            />
          )}
          <div>
            <h1 className="mb-1 text-3xl font-bold">{document.title}</h1>
            <p className="text-muted-foreground">{document.invoiceNumber}</p>
          </div>
        </div>
        <div className="text-muted-foreground text-right">
          {document.meta.map((row) => (
            <p key={row.label}>
              <span>{row.label}</span> <span>{row.value}</span>
            </p>
          ))}
        </div>
      </div>

      {/* From / To */}
      <div className="mb-8 grid grid-cols-2 gap-8">
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
            {document.from.title}
          </p>
          {document.from.lines.map((line, index) => (
            <p key={index} className={index === 0 ? 'font-semibold' : 'text-muted-foreground'}>
              {line}
            </p>
          ))}
        </div>
        <div className="text-right">
          <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
            {document.to.title}
          </p>
          {document.to.lines.map((line, index) => (
            <p key={index} className={index === 0 ? 'font-semibold' : 'text-muted-foreground'}>
              {line}
            </p>
          ))}
        </div>
      </div>

      {/* Items Table */}
      <table className="mb-8 w-full">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="p-2 text-left">{document.columns.product}</th>
            <th className="p-2 text-right">{document.columns.price}</th>
            <th className="p-2 text-center">{document.columns.quantity}</th>
            <th className="p-2 text-right">{document.columns.amount}</th>
          </tr>
        </thead>
        <tbody>
          {document.lines.map((line, index) => (
            <tr key={index} className="border-b">
              <td className="max-w-50 p-2">
                <p className="line-clamp-2 overflow-hidden break-all text-ellipsis">{line.name}</p>
                {line.description && (
                  <p className="text-muted-foreground line-clamp-2 overflow-hidden text-xs break-all text-ellipsis">
                    {line.description}
                  </p>
                )}
              </td>
              <td className="p-2 text-right">{line.price}</td>
              <td className="p-2 text-center">{line.quantity}</td>
              <td className="p-2 text-right">{line.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div className="mb-8 flex justify-end">
        <div className="w-64">
          {document.summary.map((row) => (
            <div key={row.label} className="flex justify-between py-1">
              <span className="text-muted-foreground">{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t-2 py-2 text-lg font-bold">
            <span>{document.total.label}</span>
            <span>{document.total.value}</span>
          </div>
        </div>
      </div>

      {/* Notes & Terms */}
      {(document.notes || document.terms) && (
        <div className="space-y-4 border-t pt-4">
          {document.notes && (
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                {document.notes.title}
              </p>
              <p className="text-muted-foreground whitespace-pre-wrap">{document.notes.text}</p>
            </div>
          )}
          {document.terms && (
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                {document.terms.title}
              </p>
              <p className="text-muted-foreground whitespace-pre-wrap">{document.terms.text}</p>
            </div>
          )}
        </div>
      )}

      {/* Bank Info */}
      {document.bank && (
        <div className="bg-muted/30 mt-6 rounded p-4">
          <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
            {document.bank.title}
          </p>
          {document.bank.lines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
