import 'server-only';
import { z } from 'zod';
import { Currency } from '@prisma/client';
import { listCustomersForAssistant } from '@/lib/services/customers/customers';
import { freelancerText, nullableFreelancerText } from './freelancer-text';
import type { ReadOnlyToolDefinition, ReadOnlyToolHandler } from './types';
import { pageInfoSchema } from './shared';

const text = z.object({ freelancerText: z.string() });
const input = z.object({
  page: z.number().int().min(1).optional().describe('Page number, from 1. Default 1.'),
  pageSize: z.number().int().min(1).optional().describe('Rows per page. Default 20; above 20 is capped at 20.'),
  name: z
    .string()
    .max(100)
    .optional()
    .describe('Part of a Customer name; letter case, extra spaces and look-alike Latin/Cyrillic letters are ignored. ' +
        'Empty or absent = every Customer.'),
});
const output = z.object({
  rows: z
    .array(
      z.object({
        customerId: z.string(),
        name: text,
        companyName: text.nullable(),
        email: z.string().nullable(),
        phone: text.nullable(),
        taxId: text.nullable(),
        address: text.nullable(),
        city: text.nullable(),
        country: text.nullable(),
        postalCode: text.nullable(),
        defaultCurrency: z.nativeEnum(Currency),
      })
    )
    .describe('Customers with their current details, by name then id. At most 20 per page.'),
  pageInfo: pageInfoSchema,
});

export const customersTool: ReadOnlyToolDefinition<typeof input, typeof output> = {
  name: 'list_customers',
  title: 'Customers',
  description:
    "Lists the Freelancer's Customers with their current details and record ids, optionally filtered by part " +
    'of a name — ignoring letter case, extra spaces and letters that look the same in Latin and Cyrillic — ' +
    'matched against the current name and the names copied onto their invoices. At most 20 rows per page; ' +
    '`pageInfo.total` says how many matched in all.',
  inputSchema: input,
  outputSchema: output,
};

export const customersHandler: ReadOnlyToolHandler<typeof input, typeof output> = async (args, { actor }) => {
  const res = await listCustomersForAssistant(actor, args);
  if (!res.success) return res;
  return {
    success: true,
    data: {
      pageInfo: res.data.pageInfo,
      rows: res.data.rows.map((r) => ({
        ...r,
        name: freelancerText(r.name),
        companyName: nullableFreelancerText(r.companyName),
        phone: nullableFreelancerText(r.phone),
        taxId: nullableFreelancerText(r.taxId),
        address: nullableFreelancerText(r.address),
        city: nullableFreelancerText(r.city),
        country: nullableFreelancerText(r.country),
        postalCode: nullableFreelancerText(r.postalCode),
      })),
    },
  };
};
