import { UNIT_OPTIONS } from '@/constants/unit-options';

/**
 * Format location string from city and country
 * @param city - City name
 * @param country - Country name
 * @returns Formatted location string or undefined if both are empty
 */
export function formatLocation(
  city?: string | null,
  country?: string | null
): string | undefined {
  if (city && country) return `${city}, ${country}`;
  return city || country || undefined;
}

/**
 * Format full address from address parts
 * @param parts - Array of address parts (address, city, postalCode, country)
 * @returns Formatted address string
 */
export function formatFullAddress(
  parts: (string | null | undefined)[]
): string {
  return parts.filter(Boolean).join(', ');
}

/**
 * Format currency value with currency symbol
 * @param amount - Numeric amount to format
 * @param currency - Currency code (USD, EUR, UAH, etc.)
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatter.format(amount);
}

/**
 * Format unit with label from UNIT_OPTIONS
 * @param unit - Unit value (e.g., 'hours', 'pcs', 'kg')
 * @returns Formatted unit label or original unit if not found
 */
export function getUnitLabel(unit: string): string {
  const unitOption = UNIT_OPTIONS.find((option) => option.value === unit);
  return unitOption ? unitOption.label : unit;
}
