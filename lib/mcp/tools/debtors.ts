import 'server-only';
import { z } from 'zod';
import { Currency } from '@prisma/client';
import { listDebtorsPage } from '@/lib/services/dashboard/assistant-reads';
import { freelancerText } from '@/lib/mcp/answers';
import type { ReadOnlyToolDefinition, ReadOnlyToolHandler } from '@/lib/mcp/server';
import { outputBase, pageInfoSchema, pageInputShape } from './shared';

const currency = z.nativeEnum(Currency);
const input = z.object(pageInputShape);
const output = z.object({
  ...outputBase,
  rows: z
    .array(
      z.object({
        customer: z.object({ customerId: z.string(), name: z.object({ freelancerText: z.string() }) }),
        currency,
        rank: z.number().int().describe('1 = owes the most in that currency.'),
        overdueTotal: z.string(),
        overdueCount: z.number().int(),
      })
    )
    .describe('Debtors by currency, then rank. At most 50 per page.'),
  totals: z.array(
    z.object({
      currency,
      debtorCount: z.number().int(),
      overdueTotal: z.string(),
      overdueCount: z.number().int(),
    })
  ),
  pageInfo: pageInfoSchema,
});

export const debtorsTool: ReadOnlyToolDefinition<typeof input, typeof output> = {
  name: 'list_debtors',
  title: 'Debtors (who owes money)',
  description:
    'Lists every Debtor (a Customer with an overdue invoice) ranked by total overdue amount within ' +
    'each currency, with the overdue count and total. Takes no period.',
  inputSchema: input,
  outputSchema: output,
};

export const debtorsHandler: ReadOnlyToolHandler<typeof input, typeof output> = async (args, { actor }) => {
  const res = await listDebtorsPage(actor, args);
  if (!res.success) return res;
  return {
    success: true,
    data: {
      ...res.data,
      rows: res.data.rows.map((r) => ({
        ...r,
        customer: { ...r.customer, name: freelancerText(r.customer.name) },
      })),
    },
  };
};
