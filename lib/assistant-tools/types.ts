import type { z } from 'zod';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import type { ActionResult } from '@/types/result';

export interface McpCallContext {
  actor: ActingFreelancer;
  keyId: string;
  /** Public origin of this deployment, for links that open a record in Invoice Forge. */
  origin: string;
}

export type ZodObject = z.ZodObject<z.ZodRawShape>;

export interface ReadOnlyToolDefinition<I extends ZodObject, O extends ZodObject> {
  name: string;
  title: string;
  /** The data-not-instructions sentence is appended here. */
  description: string;
  inputSchema: I;
  outputSchema: O;
}

export type ReadOnlyToolHandler<I extends ZodObject, O extends ZodObject> = (
  args: z.infer<I>,
  context: McpCallContext
) => Promise<ActionResult<z.infer<O>>>;

export interface ReadQuestion {
  definition: ReadOnlyToolDefinition<ZodObject, ZodObject>;
  handler: ReadOnlyToolHandler<ZodObject, ZodObject>;
}
