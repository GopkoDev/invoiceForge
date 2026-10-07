import 'server-only';
import { prisma } from '@/prisma';
import { customerFormSchema, type CustomerFormValues } from '@/lib/validations/customer';
import type { CustomerWithRelations } from '@/types/customer/types';
import { ok, fail, type ActionResult, type ActionFailure } from '@/types/result';
import {
  zodValidationFailure,
  hasInvoicesConflict,
  isRestrictForeignKeyError,
  failed,
} from '@/lib/services/_shared/result-helpers';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { notFoundOnMiss } from '@/lib/services/_shared/owner-scope';
import { escapeLike, ilikeAny, paginate, parseListQuery, type ListQuery, type Page } from '@/lib/services/_shared/list-query';
import { z } from 'zod';
import type { Currency, Prisma } from '@prisma/client';
import {
  isPageOutOfRange,
  pageOutOfRange,
  strictPage,
  strictPageInfo,
  type StrictPageInfo,
} from '@/lib/services/_shared/strict-page';
import type { NameMatch } from '@/lib/services/sender-profiles/resolve-by-name';

const NOT_FOUND_MESSAGE = 'Customer not found.';
const SEARCH_FIELDS = ['name', 'companyName', 'email'];
const countsInclude = { _count: { select: { invoices: true, customPrices: true } } } as const;

export async function listCustomers(
  actor: ActingFreelancer,
  query?: ListQuery,
): Promise<ActionResult<Page<CustomerWithRelations>>> {
  const parsed = parseListQuery(query);
  if (!parsed.success) return parsed;
  const where = {
    userId: actor.userId,
    ...ilikeAny(SEARCH_FIELDS, parsed.data.search ?? ''),
  };
  try {
    const page = await paginate({
      count: () => prisma.customer.count({ where }),
      findMany: (args) =>
        prisma.customer.findMany({
          where,
          include: countsInclude,
          ...args,
        } as never) as unknown as Promise<CustomerWithRelations[]>,
      orderBy: [{ createdAt: 'desc' }],
      query: parsed.data,
    });
    return ok(page);
  } catch (error) {
    return failed('Error fetching customers:', error, 'Failed to fetch customers.');
  }
}

export async function getCustomer(
  actor: ActingFreelancer,
  id: string,
): Promise<ActionResult<CustomerWithRelations>> {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id, userId: actor.userId },
      include: countsInclude,
    });
    if (!customer) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);
    return ok(customer);
  } catch (error) {
    return failed('Error fetching customer:', error, 'Failed to fetch customer.');
  }
}

export async function createCustomer(
  actor: ActingFreelancer,
  input: CustomerFormValues,
): Promise<ActionResult<{ id: string }>> {
  const parsed = customerFormSchema.safeParse(input);
  if (!parsed.success) return zodValidationFailure(parsed.error);
  try {
    const customer = await prisma.customer.create({
      data: { userId: actor.userId, ...parsed.data },
    });
    return ok({ id: customer.id });
  } catch (error) {
    return failed('Error creating customer:', error, 'Failed to create customer.');
  }
}

export async function updateCustomer(
  actor: ActingFreelancer,
  id: string,
  input: CustomerFormValues,
): Promise<ActionResult> {
  const parsed = customerFormSchema.safeParse(input);
  if (!parsed.success) return zodValidationFailure(parsed.error);
  try {
    const result = await notFoundOnMiss(
      prisma.customer.update({ where: { id, userId: actor.userId }, data: parsed.data }),
      NOT_FOUND_MESSAGE,
    );
    if ('success' in result) return result as ActionFailure;
    return ok();
  } catch (error) {
    return failed('Error updating customer:', error, 'Failed to update customer.');
  }
}

export async function deleteCustomer(actor: ActingFreelancer, id: string): Promise<ActionResult> {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id, userId: actor.userId },
      include: { _count: { select: { invoices: true } } },
    });
    if (!customer) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);
    if (customer._count.invoices > 0) return hasInvoicesConflict('customer', customer._count.invoices);

    try {
      await prisma.customer.delete({ where: { id, userId: actor.userId } });
    } catch (deleteError) {
      if (isRestrictForeignKeyError(deleteError)) {
        // An invoice was saved between the count and this delete (Restrict FK, P2003): recount
        // and report the same CONFLICT, never FAILED (sad.md flow 9, AC-17).
        const invoiceCount = await prisma.invoice.count({
          where: { customerId: id, customer: { userId: actor.userId } },
        });
        return hasInvoicesConflict('customer', invoiceCount);
      }
      throw deleteError;
    }
    return ok();
  } catch (error) {
    return failed('Error deleting customer:', error, 'Failed to delete customer.');
  }
}

// T16 (AC-08, AC-17, AC-21): the Assistant reads of Customers. A Customer is found by part of its
// current name or of a name copied onto one of its invoices, ignoring case; only the acting
// Freelancer's Customers are ever scanned, so another Freelancer's is answered like a missing one.

const MAX_CANDIDATES = 50;
const MAX_INT = 2 ** 31 - 1;

function nameMatchWhere(actor: ActingFreelancer, text: string): Prisma.CustomerWhereInput {
  const contains = { contains: escapeLike(text), mode: 'insensitive' } as const;
  return {
    userId: actor.userId,
    OR: [{ name: contains }, { invoices: { some: { customerName: contains } } }],
  };
}

export type CustomerMatch = NameMatch<{ customerId: string; name: string }>;

export async function resolveCustomerByName(
  actor: ActingFreelancer,
  name: string,
): Promise<ActionResult<CustomerMatch>> {
  const text = name.trim();
  if (text === '') return ok({ kind: 'none' });
  try {
    const rows = await prisma.customer.findMany({
      where: nameMatchWhere(actor, text),
      select: { id: true, name: true, companyName: true, email: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: MAX_CANDIDATES,
    });
    if (rows.length === 0) return ok({ kind: 'none' });
    if (rows.length === 1) return ok({ kind: 'one', customerId: rows[0].id, name: rows[0].name });
    return ok({
      kind: 'candidates',
      candidates: rows.map((r) => {
        const detail = r.email ?? r.companyName;
        return { id: r.id, name: r.name, ...(detail ? { detail } : {}) };
      }),
    });
  } catch (error) {
    return failed('Error resolving customer by name:', error, 'Failed to fetch customers.');
  }
}

const listCustomersInput = z.object({
  page: z.number().int().min(1).max(MAX_INT).optional(),
  pageSize: z.number().int().min(1).max(MAX_INT).optional(),
  name: z.string().trim().max(100, 'Name can be at most 100 characters.').optional(),
});

export type ListCustomersForAssistantInput = z.input<typeof listCustomersInput>;

export type CustomerDetails = {
  customerId: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  defaultCurrency: Currency;
};

export type CustomersAnswer = { rows: CustomerDetails[]; pageInfo: StrictPageInfo };

export async function listCustomersForAssistant(
  actor: ActingFreelancer,
  input: ListCustomersForAssistantInput = {},
): Promise<ActionResult<CustomersAnswer>> {
  const parsed = listCustomersInput.safeParse(input ?? {});
  if (!parsed.success) return zodValidationFailure(parsed.error, 'Invalid list request.');
  const where: Prisma.CustomerWhereInput = parsed.data.name
    ? nameMatchWhere(actor, parsed.data.name)
    : { userId: actor.userId };
  try {
    const plan = strictPage(parsed.data);
    const total = await prisma.customer.count({ where });
    if (isPageOutOfRange(plan.page, total, plan.pageSize)) return pageOutOfRange(total, plan.pageSize);
    const rows =
      total === 0
        ? []
        : await prisma.customer.findMany({
            where,
            select: {
              id: true,
              name: true,
              companyName: true,
              email: true,
              phone: true,
              taxId: true,
              address: true,
              city: true,
              country: true,
              postalCode: true,
              defaultCurrency: true,
            },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            skip: plan.offset,
            take: plan.limit,
          });
    return ok({
      rows: rows.map(({ id, ...rest }): CustomerDetails => ({ customerId: id, ...rest })),
      pageInfo: strictPageInfo(plan, total),
    });
  } catch (error) {
    return failed('Error listing customers for the Assistant:', error, 'Failed to fetch customers.');
  }
}
