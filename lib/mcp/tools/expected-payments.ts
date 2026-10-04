import 'server-only';
import { z } from 'zod';
import { listExpectedPaymentsPage } from '@/lib/services/dashboard/assistant-reads';
import type { AssistantPeriodInput } from '@/lib/services/dashboard/period';
import type { ReadOnlyToolDefinition, ReadOnlyToolHandler } from '@/lib/mcp/server';
import {
  appliedPeriodSchema,
  currencyTotalSchema,
  invoiceRowSchema,
  outputBase,
  pageInfoSchema,
  pageInputShape,
  periodInput,
  wrapInvoiceRow,
} from './shared';

const input = z.object({ ...pageInputShape, period: periodInput.optional() });
const output = z.object({
  ...outputBase,
  period: appliedPeriodSchema,
  rows: z.array(invoiceRowSchema).describe('Pending, not-yet-overdue invoices by due date. At most 50 per page.'),
  totals: z.array(currencyTotalSchema).describe('Total and count per currency over every match.'),
  pageInfo: pageInfoSchema,
});

export const expectedPaymentsTool: ReadOnlyToolDefinition<typeof input, typeof output> = {
  name: 'list_expected_payments',
  title: 'Expected payments',
  description:
    'Lists pending invoices that are not yet overdue, grouped by currency and ordered by due date, ' +
    'with a total and count per currency over every match. With a period, only those due within it; ' +
    'without one, every pending invoice. The answer states the period and time zone used.',
  inputSchema: input,
  outputSchema: output,
};

export const expectedPaymentsHandler: ReadOnlyToolHandler<typeof input, typeof output> = async (
  args,
  { actor }
) => {
  const res = await listExpectedPaymentsPage(actor, {
    ...args,
    period: args.period as AssistantPeriodInput | undefined,
  });
  if (!res.success) return res;
  return { success: true, data: { ...res.data, rows: res.data.rows.map(wrapInvoiceRow) } };
};
