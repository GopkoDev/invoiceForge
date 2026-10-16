// ai-chat-v2 (spec §1, §6 "Bank account exposure"; openapi AccountLastFour): the last four characters of a bank
// account number with whitespace removed, fewer when the number is shorter, never padded. The only part of an
// account number any read question returns.

export function accountLastFour(accountNumber: string): string {
  return accountNumber.replace(/\s+/g, '').slice(-4);
}
