import 'server-only';
import { z } from 'zod';
import { Currency } from '@prisma/client';
import { listProductsForAssistant } from '@/lib/services/products/products';
import { freelancerText } from './freelancer-text';
import { inOutcomeSpan } from './outcome-span';
import type { ReadOnlyToolDefinition, ReadOnlyToolHandler } from './types';
import { pageInfoSchema } from './shared';

// ai-chat-v2 T06 (openapi x-mcp-tools list_products, ProductsAnswer; AC-02, AC-05, AC-06, AC-07). One row per product
// and currency (the schema holds one price per product); prices exactly as stored, never converted.

const text = z.object({ freelancerText: z.string() });
const decimal = z.string().describe('Exact amount with two decimals, as stored, never converted between currencies.');
const input = z.object({
  name: z
    .string()
    .max(100)
    .optional()
    .describe(
      'Part of a product name; letter case, extra spaces and look-alike Latin/Cyrillic letters are ignored. ' +
        'Empty or absent = the whole catalogue.'
    ),
  customerId: z
    .string()
    .optional()
    .describe("A Customer id from a list_customers answer; adds that Customer's Custom price per product."),
  page: z.number().int().min(1).optional().describe('Page number, from 1. Default 1.'),
  pageSize: z.number().int().min(1).optional().describe('Rows per page. Default 20; above 20 is capped at 20.'),
});
const output = z.object({
  rows: z
    .array(
      z.object({
        productId: z.string(),
        name: text,
        unit: text,
        price: decimal.describe('The standard price in this currency.'),
        currency: z.nativeEnum(Currency),
        customPrice: decimal
          .nullable()
          .describe("The named Customer's Custom price in this currency; null without customerId or when none."),
      })
    )
    .describe('Active products, by name, then currency, then id. At most 20 per page.'),
  customer: z
    .object({ customerId: z.string(), name: text })
    .nullable()
    .describe('The Customer the Custom prices are for, when customerId was given; else null.'),
  pageInfo: pageInfoSchema,
});

export const productsTool: ReadOnlyToolDefinition<typeof input, typeof output> = {
  name: 'list_products',
  title: 'Products and prices',
  description:
    "Lists the Freelancer's active catalogue products, optionally filtered by part of a name (ignoring letter " +
    'case, extra spaces and letters that look the same in Latin and Cyrillic). Each row is one product in one ' +
    'currency with its standard price; a product sold in several currencies appears once per currency. Pass a ' +
    "`customerId` taken from a `list_customers` answer to also get that Customer's Custom price per product. " +
    'At most 20 rows per page; `pageInfo.total` says how many matched in all.',
  inputSchema: input,
  outputSchema: output,
};

export const productsHandler: ReadOnlyToolHandler<typeof input, typeof output> = (args, { actor }) =>
  inOutcomeSpan('assistant-tools.products', async () => {
    const res = await listProductsForAssistant(actor, args);
    if (!res.success) return res;
    const { rows, customer, pageInfo } = res.data;
    return {
      success: true,
      data: {
        rows: rows.map((p) => ({ ...p, name: freelancerText(p.name), unit: freelancerText(p.unit) })),
        customer: customer ? { customerId: customer.customerId, name: freelancerText(customer.name) } : null,
        pageInfo,
      },
    };
  });
