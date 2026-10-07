import 'server-only';
import { z } from 'zod';
import { searchInvoicesForAssistant } from '@/lib/services/invoices/assistant-search';
import { fail } from '@/types/result';
import type { ReadOnlyToolDefinition, ReadOnlyToolHandler } from '@/lib/mcp/server';
import {
  currencyTotalSchema,
  outputBase,
  pageInfoSchema,
  pageInputShape,
  wrapInvoiceRow,
} from './shared';

const text = z.string().max(100);
const day = z.string().describe('A calendar day YYYY-MM-DD.');
const input = z.object({
  page: pageInputShape.page,
  pageSize: pageInputShape.pageSize,
  customerId: z.string().optional().describe('A Customer record id from an earlier answer. Not with `customer`.'),
  customer: text.optional().describe('Part of a Customer name. Not with `customerId`.'),
  senderProfileId: z.string().optional().describe('A sender profile id from an earlier answer. Not with `senderProfile`.'),
  senderProfile: text.optional().describe('Part of a sender profile name. Not with `senderProfileId`.'),
  status: z
    .array(z.enum(['draft', 'pending', 'overdue', 'paid', 'cancelled']))
    .optional()
    .describe('Absent = pending, overdue and paid. Drafts and cancelled invoices only when asked for.'),
  invoiceNumber: text.optional().describe('Part of an invoice number.'),
  issueDateFrom: day.optional(),
  issueDateTo: day.optional(),
  dueDateFrom: day.optional(),
  dueDateTo: day.optional(),
});
const output = z.object({
  ...outputBase,
  rows: z
    .array(
      z.object({
        invoiceId: z.string(),
        invoiceNumber: z.string(),
        senderProfile: z.object({ senderProfileId: z.string(), name: z.object({ freelancerText: z.string() }) }),
        customer: z.object({ customerId: z.string(), name: z.object({ freelancerText: z.string() }) }),
        status: z.enum(['draft', 'pending', 'overdue', 'paid', 'cancelled']),
        amount: z.string(),
        currency: z.string(),
        dueDate: day,
        daysOverdue: z.number().int().nullable(),
      })
    )
    .describe('Invoices by issue date, newest first. At most 50 per page. Notes and lines are not searched.'),
  totals: z.array(currencyTotalSchema).describe('Total and count per currency over every match.'),
  pageInfo: pageInfoSchema,
});

export const searchTool: ReadOnlyToolDefinition<typeof input, typeof output> = {
  name: 'search_invoices',
  title: 'Search invoices',
  description:
    'Searches the Freelancer\'s invoices by Customer, sender profile, status, issue-date range, ' +
    'due-date range and part of an invoice number. Several matching names are returned as candidates.',
  inputSchema: input,
  outputSchema: output,
};

export const searchHandler: ReadOnlyToolHandler<typeof input, typeof output> = async (args, { actor }) => {
  if (args.customerId !== undefined && args.customer !== undefined) {
    return fail('VALIDATION', 'Give the Customer by id or by name, not both.', {
      fieldErrors: { customer: ['Give the Customer by id or by name, not both.'] },
    });
  }
  if (args.senderProfileId !== undefined && args.senderProfile !== undefined) {
    return fail('VALIDATION', 'Give the sender profile by id or by name, not both.', {
      fieldErrors: { senderProfile: ['Give the sender profile by id or by name, not both.'] },
    });
  }
  const res = await searchInvoicesForAssistant(actor, args);
  if (!res.success) return res;
  return { success: true, data: { ...res.data, rows: res.data.rows.map(wrapInvoiceRow) } };
};
