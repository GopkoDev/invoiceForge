'use server';

import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import {
  customerFormSchema,
  CustomerFormValues,
} from '@/lib/validations/customer';
import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import { CustomerWithRelations } from '@/types/customer/types';
import { ActionResult, ok, fail } from '@/types/actions';
import { z } from 'zod';
import { zodValidationFailure } from '@/lib/actions/action-result-helpers';

export async function getCustomers(): Promise<
  ActionResult<CustomerWithRelations[]>
> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const customers = await prisma.customer.findMany({
      where: {
        userId,
      },
      include: {
        _count: {
          select: {
            invoices: true,
            customPrices: true,
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });

    return ok(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    return fail('FAILED', 'Failed to fetch customers.');
  }
}

export async function getCustomer(
  id: string
): Promise<ActionResult<CustomerWithRelations>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const customer = await prisma.customer.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        _count: {
          select: {
            invoices: true,
            customPrices: true,
          },
        },
      },
    });

    if (!customer) {
      return fail('NOT_FOUND', 'Customer not found.');
    }

    return ok(customer);
  } catch (error) {
    console.error('Error fetching customer:', error);
    return fail('FAILED', 'Failed to fetch customer.');
  }
}

export async function createCustomer(
  data: CustomerFormValues
): Promise<ActionResult<{ id: string }>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;
    const validatedData = customerFormSchema.parse(data);

    const customer = await prisma.customer.create({
      data: {
        userId,
        ...validatedData,
      },
    });

    revalidatePath(protectedRoutes.customers);

    return ok({ id: customer.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodValidationFailure(error);
    }
    console.error('Error creating customer:', error);
    return fail('FAILED', 'Failed to create customer.');
  }
}

export async function updateCustomer(
  id: string,
  data: CustomerFormValues
): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;
    const validatedData = customerFormSchema.parse(data);

    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existingCustomer) {
      return fail('NOT_FOUND', 'Customer not found.');
    }

    await prisma.customer.update({
      where: { id },
      data: validatedData,
    });

    revalidatePath(protectedRoutes.customers);
    revalidatePath(protectedRoutes.customerEdit(id));

    return ok();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodValidationFailure(error);
    }
    console.error('Error updating customer:', error);
    return fail('FAILED', 'Failed to update customer.');
  }
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const customer = await prisma.customer.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        _count: {
          select: {
            invoices: true,
          },
        },
      },
    });

    if (!customer) {
      return fail('NOT_FOUND', 'Customer not found.');
    }

    if (customer._count.invoices > 0) {
      return fail(
        'CONFLICT',
        `Cannot delete customer with ${customer._count.invoices} invoice(s). Please delete or reassign invoices first.`,
        { details: { kind: 'HAS_INVOICES', invoiceCount: customer._count.invoices } },
      );
    }

    await prisma.customer.delete({
      where: { id },
    });

    revalidatePath(protectedRoutes.customers);

    return ok();
  } catch (error) {
    console.error('Error deleting customer:', error);
    return fail('FAILED', 'Failed to delete customer.');
  }
}
