import 'server-only';
import { z } from 'zod';
import { Currency } from '@prisma/client';
import { getSummaryFiguresAllCurrencies } from '@/lib/services/dashboard/assistant-reads';
import type { AssistantPeriodInput } from '@/lib/services/dashboard/period';
import type { ReadOnlyToolDefinition, ReadOnlyToolHandler } from '@/lib/mcp/server';
import { appliedPeriodSchema, outputBase, periodInput } from './shared';

const figure = z.object({
  total: z.string(),
  count: z.number().int(),
  countedBy: z.enum(['issue_date', 'due_date', 'none']).describe('The date the figure is counted by.'),
});
const input = z.object({
  period: periodInput.optional().describe('The Dashboard period. Absent = this-month.'),
});
const output = z.object({
  ...outputBase,
  period: appliedPeriodSchema,
  currencies: z.array(
    z.object({
      currency: z.nativeEnum(Currency),
      received: figure,
      planned: figure,
      overdue: figure,
      allFuturePayments: figure,
    })
  ),
});

export const summaryTool: ReadOnlyToolDefinition<typeof input, typeof output> = {
  name: 'get_summary_figures',
  title: 'Summary figures',
  description:
    'Returns four figures per currency for a Dashboard period, computed by Invoice Forge exactly as ' +
    'the dashboard does: received, planned, overdue and all future payments, each a total and a ' +
    'count naming the date it is counted by. Never converted between currencies.',
  inputSchema: input,
  outputSchema: output,
};

export const summaryHandler: ReadOnlyToolHandler<typeof input, typeof output> = async (args, { actor }) =>
  getSummaryFiguresAllCurrencies(actor, args.period as AssistantPeriodInput | undefined);
