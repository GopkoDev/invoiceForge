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
import { ilikeAny, paginate, parseListQuery, type ListQuery, type Page } from '@/lib/services/_shared/list-query';

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
