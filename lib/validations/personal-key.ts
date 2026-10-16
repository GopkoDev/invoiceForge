import { z } from 'zod';

export const KEY_NAME_MESSAGE = 'The name must be 1 to 50 characters and different from your other active keys.';
export const KEY_LIMIT_MESSAGE = 'At most 10 keys can be active at once. Revoke one to make room.';

/** Maximum number of simultaneously active Personal keys per Freelancer (AC-04). */
export const MAX_ACTIVE_PERSONAL_KEYS = 10;

export const personalKeyNameSchema = z
  .string({ invalid_type_error: KEY_NAME_MESSAGE, required_error: KEY_NAME_MESSAGE })
  .trim()
  .min(1, KEY_NAME_MESSAGE)
  .max(50, KEY_NAME_MESSAGE);

/** Draft permission is chosen at creation only and defaults to off (AC-25, AC-26). */
export const personalKeyCanCreateDraftsSchema = z.boolean().default(false);
