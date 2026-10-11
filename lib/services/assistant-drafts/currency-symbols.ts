// "$" is USD, "€" EUR, "£" GBP; "$" is unclear when the default bank account is in another dollar
// currency (spec.md §1 "Currency symbols", AC-19). Nothing is guessed: unknown words stay unclear.
import 'server-only';

const CODES = ['UAH', 'USD', 'EUR', 'GBP', 'PLN'];
const SYMBOLS: Record<string, string> = { '€': 'EUR', '£': 'GBP' };
const OTHER_DOLLARS = ['CAD', 'AUD'];

export type CurrencyReading =
  | { kind: 'RESOLVED'; currency: string }
  | { kind: 'UNCLEAR'; options: string[] };

export function interpretCurrency(written: string, defaultCurrency: string): CurrencyReading {
  const text = written.trim();
  if (text === '$') {
    return OTHER_DOLLARS.includes(defaultCurrency)
      ? { kind: 'UNCLEAR', options: ['USD', defaultCurrency] }
      : { kind: 'RESOLVED', currency: 'USD' };
  }
  const symbol = SYMBOLS[text];
  if (symbol) return { kind: 'RESOLVED', currency: symbol };
  const code = text.toUpperCase();
  if (CODES.includes(code)) return { kind: 'RESOLVED', currency: code };
  return { kind: 'UNCLEAR', options: CODES };
}
