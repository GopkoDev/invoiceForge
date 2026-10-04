import 'server-only';
import { z } from 'zod';
import { findInvoiceByReference, type InvoiceAnswer } from '@/lib/services/invoices/find-by-reference';
import { freelancerText, nullableFreelancerText } from '@/lib/mcp/answers';
import type { ReadOnlyToolDefinition, ReadOnlyToolHandler } from '@/lib/mcp/server';
import { todayIn } from '@/lib/services/_shared/overdue';
import { outputBase } from './shared';

const input = z.object({
  invoiceId: z.string().max(100).optional().describe('An invoice record id from an earlier answer.'),
  invoiceNumber: z.string().max(100).optional().describe('The whole invoice number. Not with `invoiceId`.'),
  senderProfile: z
    .string()
    .max(100)
    .optional()
    .describe('A sender profile name, to tell apart equal numbers. Only with `invoiceNumber`.'),
});
const output = z.object({
  ...outputBase,
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  status: z.enum(['draft', 'pending', 'overdue', 'paid', 'cancelled']),
  daysOverdue: z.number().int().nullable(),
  issueDate: z.string(),
  dueDate: z.string(),
  currency: z.string(),
  sender: z.record(z.unknown()).describe('Sender details as recorded on the invoice.'),
  customer: z.record(z.unknown()).describe('Customer details as recorded on the invoice.'),
  lines: z.array(z.record(z.unknown())),
  amounts: z.record(z.string()),
  paymentTerms: z.object({ freelancerText: z.string() }).nullable(),
  terms: z.object({ freelancerText: z.string() }).nullable(),
  notes: z.object({ freelancerText: z.string() }).nullable(),
  poNumber: z.object({ freelancerText: z.string() }).nullable(),
  link: z.string().describe('Absolute link that opens the invoice in invoiceFlow.'),
});

export const invoiceTool: ReadOnlyToolDefinition<typeof input, typeof output> = {
  name: 'get_invoice',
  title: 'One invoice',
  description:
    'Returns one invoice as stored, by record id or by invoice number (optionally with a sender ' +
    'profile name), with a link that opens it in invoiceFlow. Equal numbers on several sender ' +
    'profiles are returned as candidates. A draft or cancelled invoice is labelled by its status.',
  inputSchema: input,
  outputSchema: output,
};

const wrapNullable = nullableFreelancerText;

function wrapAnswer(a: InvoiceAnswer, today: string, timeZone: string, origin: string) {
  const { sender, customer } = a;
  return {
    today,
    timeZone,
    ...a,
    sender: {
      ...sender,
      name: freelancerText(sender.name),
      legalName: wrapNullable(sender.legalName),
      taxId: wrapNullable(sender.taxId),
      address: wrapNullable(sender.address),
      city: wrapNullable(sender.city),
      country: wrapNullable(sender.country),
      postalCode: wrapNullable(sender.postalCode),
      phone: wrapNullable(sender.phone),
    },
    customer: {
      ...customer,
      name: freelancerText(customer.name),
      companyName: wrapNullable(customer.companyName),
      taxId: wrapNullable(customer.taxId),
      phone: wrapNullable(customer.phone),
      address: wrapNullable(customer.address),
      city: wrapNullable(customer.city),
      country: wrapNullable(customer.country),
      postalCode: wrapNullable(customer.postalCode),
    },
    lines: a.lines.map((l) => ({
      ...l,
      name: freelancerText(l.name),
      description: wrapNullable(l.description),
      unit: freelancerText(l.unit),
    })),
    paymentTerms: wrapNullable(a.paymentTerms),
    terms: wrapNullable(a.terms),
    notes: wrapNullable(a.notes),
    poNumber: wrapNullable(a.poNumber),
    link: `${origin}/invoices/${encodeURIComponent(a.invoiceId)}/edit`,
  };
}

export const invoiceHandler: ReadOnlyToolHandler<typeof input, typeof output> = async (
  args,
  { actor, origin }
) => {
  const res = await findInvoiceByReference(actor, args);
  if (!res.success) return res;
  const today = todayIn(actor.timeZone);
  return { success: true, data: wrapAnswer(res.data, today, actor.timeZone, origin) };
};
