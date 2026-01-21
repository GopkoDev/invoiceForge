import { Currency } from '@prisma/client';

export const CURRENCY_OPTIONS = [
  { value: Currency.UAH, label: 'UAH - Ukrainian Hryvnia' },
  { value: Currency.USD, label: 'USD - US Dollar' },
  { value: Currency.EUR, label: 'EUR - Euro' },
  { value: Currency.GBP, label: 'GBP - British Pound' },
  { value: Currency.PLN, label: 'PLN - Polish Zloty' },
];

export function getCurrenciesValues() {
  return CURRENCY_OPTIONS.map((option) => option.value);
}
