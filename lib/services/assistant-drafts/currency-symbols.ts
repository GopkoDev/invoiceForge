// "$" is USD, "€" EUR, "£" GBP (and the currency words, review R6-4); "$" is unclear when the default bank account is in another dollar
// currency (spec.md §1 "Currency symbols", AC-19). Nothing is guessed: unknown words stay unclear.
import 'server-only';

const CODES = ['UAH', 'USD', 'EUR', 'GBP', 'PLN'];
const SYMBOLS: Record<string, string> = { '€': 'EUR', '£': 'GBP' };
const OTHER_DOLLARS = ['CAD', 'AUD'];

export type CurrencyReading =
  | { kind: 'RESOLVED'; currency: string }
  | { kind: 'UNCLEAR'; options: string[] };

// Currency words read like their symbol (review R6-4): "dollars" is "$", so it stays unclear beside a
// CAD/AUD default account. Matched on the word's start, ignoring case: "доларів", "Euro", "гривень".
const WORDS: Array<[RegExp, string]> = [
  [/^(dollar|долар)/i, '$'],
  [/^(euro|євро|евро)/i, '€'],
  [/^(pound|фунт)/i, '£'],
  [/^(hryvn|грив|грн)/i, 'UAH'],
  [/^(zlot|złot|злот)/i, 'PLN'],
];

export function interpretCurrency(written: string, defaultCurrency: string): CurrencyReading {
  const raw = written.trim();
  const text = WORDS.find(([pattern]) => pattern.test(raw))?.[1] ?? raw;
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
