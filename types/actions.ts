/**
 * Generic action result type for server actions
 * @template T - The type of data returned on success
 */
export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};
