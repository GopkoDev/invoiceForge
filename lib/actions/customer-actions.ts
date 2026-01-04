'use server';

import { auth } from '@/auth';
import { prisma } from '@/prisma';
import {
  customerFormSchema,
  CustomerFormValues,
} from '@/lib/validations/customer';
import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import { CustomerWithRelations } from '@/types/customer/types';
import { ActionResult } from '@/types/actions';

export async function getCustomers(): Promise<
  ActionResult<CustomerWithRelations[]>
> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const customers = await prisma.customer.findMany({
      where: {
        userId: session.user.id,
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

    return { success: true, data: customers };
  } catch (error) {
    console.error('Error fetching customers:', error);
    return { success: false, error: 'Failed to fetch customers' };
  }
}

export async function getCustomer(
  id: string
): Promise<ActionResult<CustomerWithRelations>> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const customer = await prisma.customer.findFirst({
      where: {
        id,
        userId: session.user.id,
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
      return { success: false, error: 'Customer not found' };
    }

    return {
      success: true,
      data: customer,
    };
  } catch (error) {
    console.error('Error fetching customer:', error);
    return { success: false, error: 'Failed to fetch customer' };
  }
}

export async function createCustomer(
  data: CustomerFormValues
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const validatedData = customerFormSchema.parse(data);

    const customer = await prisma.customer.create({
      data: {
        userId: session.user.id,
        ...validatedData,
      },
    });

    revalidatePath(protectedRoutes.customers);

    return { success: true, data: { id: customer.id } };
  } catch (error) {
    console.error('Error creating customer:', error);
    return { success: false, error: 'Failed to create customer' };
  }
}

export async function updateCustomer(
  id: string,
  data: CustomerFormValues
): Promise<ActionResult> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const validatedData = customerFormSchema.parse(data);

    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingCustomer) {
      return { success: false, error: 'Customer not found' };
    }

    await prisma.customer.update({
      where: { id },
      data: validatedData,
    });

    revalidatePath(protectedRoutes.customers);
    revalidatePath(protectedRoutes.customerEdit(id));

    return { success: true };
  } catch (error) {
    console.error('Error updating customer:', error);
    return { success: false, error: 'Failed to update customer' };
  }
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const customer = await prisma.customer.findFirst({
      where: {
        id,
        userId: session.user.id,
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
      return { success: false, error: 'Customer not found' };
    }

    if (customer._count.invoices > 0) {
      return {
        success: false,
        error: `Cannot delete customer with ${customer._count.invoices} invoice(s). Please delete or reassign invoices first.`,
      };
    }

    await prisma.customer.delete({
      where: { id },
    });

    revalidatePath(protectedRoutes.customers);

    return { success: true };
  } catch (error) {
    console.error('Error deleting customer:', error);
    return { success: false, error: 'Failed to delete customer' };
  }
}
