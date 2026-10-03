// T20: seeds one Freelancer's workspace into the e2e app's throwaway database (the URL that
// start-app-server.mjs leaves in the runtime file), so the genuine-session specs have every
// private page's data: a sender profile with logo, a customer with image, a product and an
// invoice. Sign-in itself is NOT seeded - the Freelancer row only exists so the Sign-in link
// finds its owner; the session still comes from the real flow (genuine-session.ts).
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient } from '../../support/db/client';
import { createBankAccount } from '../../support/factories/bank-account';
import { createCustomer } from '../../support/factories/customer';
import { createFreelancer } from '../../support/factories/user';
import { createProduct } from '../../support/factories/product';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { readE2eRuntime } from './app-server';

// 1x1 PNG: a same-document image source, so previews never leave the machine.
export const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export interface SeededWorkspace {
  userId: string;
  senderProfileId: string;
  customerId: string;
  productId: string;
  invoiceId: string;
  invoiceNumber: string;
}

export async function seedWorkspace(
  email: string,
  options: { customerName?: string } = {}
): Promise<SeededWorkspace> {
  const prisma: PrismaClient = createTestPrismaClient(
    readE2eRuntime().databaseUrl
  );
  try {
    const user = await createFreelancer(prisma, { email, image: PIXEL_PNG });
    const senderProfile = await createSenderProfile(prisma, user.id, {
      logo: PIXEL_PNG,
      email,
      address: '1 Test Street',
      city: 'Testville',
      country: 'Testland',
    });
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, user.id, {
      image: PIXEL_PNG,
      ...(options.customerName ? { name: options.customerName } : {}),
    });
    const product = await createProduct(prisma, user.id);
    // Written directly (not through the invoice factory): the factory imports app modules marked
    // server-only, which Playwright's loader cannot resolve.
    const invoiceNumber = `${senderProfile.invoicePrefix}-0001`;
    const invoice = await prisma.invoice.create({
      data: {
        senderProfileId: senderProfile.id,
        customerId: customer.id,
        bankAccountId: bankAccount.id,
        invoiceNumber,
        invoiceNumberKey: invoiceNumber.toLowerCase(),
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        status: 'PENDING',
        senderName: senderProfile.name,
        senderLogo: senderProfile.logo,
        customerName: customer.name,
        bankName: bankAccount.bankName,
        bankAccountNumber: bankAccount.accountNumber,
        accountName: bankAccount.accountName,
        subtotal: 100,
        total: 100,
        currency: 'USD',
        items: {
          create: [
            {
              name: 'Test Item',
              unit: 'pcs',
              quantity: 1,
              rate: 100,
              amount: 100,
            },
          ],
        },
      },
    });
    return {
      userId: user.id,
      senderProfileId: senderProfile.id,
      customerId: customer.id,
      productId: product.id,
      invoiceId: invoice.id,
      invoiceNumber,
    };
  } finally {
    await prisma.$disconnect();
  }
}
