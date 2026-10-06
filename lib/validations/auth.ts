import { z } from 'zod';

const INVALID_ADDRESS = 'Enter a valid email address.';

// The one address rule (AC-17): at most 254 characters, ASCII only. Also applied by the Auth.js
// email provider's normalizeIdentifier, which is authoritative for direct calls.
const wellFormed = z.string().email();

export const loginEmailSchema = z.object({
  email: z
    .string()
    .refine(
      (value) =>
        value.length <= 254 &&
        /^[\x00-\x7F]*$/.test(value) &&
        wellFormed.safeParse(value).success,
      INVALID_ADDRESS
    ),
});

export type LoginEmailInput = z.infer<typeof loginEmailSchema>;
