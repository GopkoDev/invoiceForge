'use server';

import { auth } from '@/auth';
import { prisma } from '@/prisma';

export async function deleteUserAccount() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized. Please login to continue.',
      };
    }

    const userId = session.user.id;

    // Cascading delete is handled by Prisma schema (onDelete: Cascade)
    // This will delete:
    // - User record
    // - All accounts
    // - All sessions
    // - All email history
    // - All sender profiles (which cascade to bank accounts and invoices)
    // - All customers (which cascade to custom prices)
    // - All products (which cascade to custom prices and invoice items)
    await prisma.user.delete({
      where: { id: userId },
    });

    return {
      success: true,
      message: 'Account successfully deleted',
    };
  } catch (error) {
    console.error('Error deleting user account:', error);
    return {
      success: false,
      error: 'Failed to delete account. Please try again.',
    };
  }
}
