import 'server-only';
import { z } from 'zod';
import { listOverdueInvoices } from '@/lib/services/dashboard/assistant-reads';
import type { ReadOnlyToolDefinition, ReadOnlyToolHandler } from '@/lib/mcp/server';
import {
  currencyTotalSchema,
  invoiceRowSchema,
  outputBase,
  pageInfoSchema,
  pageInputShape,
  wrapInvoiceRow,
} from './shared';

const input = z.object(pageInputShape);
const output = z.object({
  ...outputBase,
  rows: z.array(invoiceRowSchema).describe('Overdue invoices by due date, then number. At most 50 per page.'),
  totals: z.array(currencyTotalSchema).describe('Total and count per currency over every overdue invoice.'),
  pageInfo: pageInfoSchema,
});

export const overdueTool: ReadOnlyToolDefinition<typeof input, typeof output> = {
  name: 'list_overdue_invoices',
  title: 'Overdue invoices',
  description:
    "Lists the Freelancer's overdue invoices as of today in their time zone: unpaid invoices past " +
    'their due date or marked overdue by hand, with days overdue and totals per currency over every ' +
    'overdue invoice.',
  inputSchema: input,
  outputSchema: output,
};

export const overdueHandler: ReadOnlyToolHandler<typeof input, typeof output> = async (args, { actor }) => {
  const res = await listOverdueInvoices(actor, args);
  if (!res.success) return res;
  return { success: true, data: { ...res.data, rows: res.data.rows.map(wrapInvoiceRow) } };
};
