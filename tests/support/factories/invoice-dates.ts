import type { PrismaClient } from '@prisma/client';
import { createSenderProfile } from './sender-profile';
import { createCustomer } from './customer';
import { createBankAccount } from './bank-account';
import { createInvoice } from './invoice';

let seq = 0;

/** Seeds one invoice per [issueDate, dueDate] pair (ISO strings, stored as given) for a Freelancer; returns their ids. */
export async function seedInvoicesWithDates(
  prisma: PrismaClient,
  userId: string,
  rows: Array<[issueDate: string, dueDate: string]>,
): Promise<string[]> {
  const senderProfile = await createSenderProfile(prisma, userId);
  const bankAccount = await createBankAccount(prisma, senderProfile.id);
  const customer = await createCustomer(prisma, userId, { name: 'C' });
  const ids: string[] = [];
  for (const [issueDate, dueDate] of rows) {
    seq += 1;
    const invoice = await createInvoice(prisma, {
      senderProfile,
      customer,
      bankAccount,
      overrides: {
        invoiceNumber: `T35-${seq}`,
        status: 'PENDING',
        issueDate: new Date(issueDate),
        dueDate: new Date(dueDate),
      },
    });
    ids.push(invoice.id);
  }
  return ids;
}

/** The stored [issueDate, dueDate] of each invoice as ISO strings, in the order of `ids`. */
export async function storedDates(prisma: PrismaClient, ids: string[]): Promise<Array<[string, string]>> {
  const rows = await prisma.invoice.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => [byId.get(id)!.issueDate.toISOString(), byId.get(id)!.dueDate.toISOString()]);
}
