import { z } from 'zod';

/**
 * Helper to convert empty string or null to null for optional fields
 *
 * This helper ensures consistent handling of optional string fields:
 * - On input: converts null/undefined to '' for validation
 * - On validation: validates as string
 * - On output: converts '' to null for database storage
 *
 * @example
 * ```ts
 * const schema = z.object({
 *   email: optionalString(z.string().email('Invalid email')),
 *   phone: optionalString(z.string().max(50)),
 * });
 * ```
 */
export const optionalString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (val) => (val === null || val === undefined ? '' : val),
    schema
      .optional()
      .or(z.literal(''))
      .transform((val) => (val === '' ? null : val))
  );

/**
 * Phone number validation according to E.164 standard
 *
 * Validates phone numbers with the following rules:
 * - Must contain 7-15 digits (E.164 standard)
 * - Allows formatting characters: +, -, ., (), spaces
 * - Empty string is valid (for optional fields)
 *
 * @example
 * ```ts
 * const schema = z.object({
 *   phone: optionalString(phoneValidation(z.string().max(50))),
 *   mobile: phoneValidation(z.string().trim().max(50)),
 * });
 * ```
 */
export const phoneValidation = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine((val) => {
    if (val === '') return true;
    // Remove all non-digit characters to count actual digits
    const digitsOnly = val.replace(/\D/g, '');
    // Must have between 7 and 15 digits (E.164 standard)
    // And only allow digits, spaces, dashes, dots, parentheses, and + at start
    return (
      digitsOnly.length >= 7 &&
      digitsOnly.length <= 15 &&
      /^[\+]?[0-9\s\-\.\(\)]+$/.test(val)
    );
  }, 'Phone must contain 7-15 digits and only valid characters (+, -, ., (), spaces)');
