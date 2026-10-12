import 'server-only';
import { overdueHandler, overdueTool } from './overdue';
import { debtorsHandler, debtorsTool } from './debtors';
import { expectedPaymentsHandler, expectedPaymentsTool } from './expected-payments';
import { summaryHandler, summaryTool } from './summary';
import { customersHandler, customersTool } from './customers';
import { searchHandler, searchTool } from './search';
import { invoiceHandler, invoiceTool } from './invoice';
import { senderProfilesHandler, senderProfilesTool } from './sender-profiles';
import type { ReadOnlyToolDefinition, ReadOnlyToolHandler, ReadQuestion, ZodObject } from './types';

export type { McpCallContext, ReadOnlyToolDefinition, ReadOnlyToolHandler, ReadQuestion } from './types';
export { freelancerText, nullableFreelancerText, type FreelancerText } from './freelancer-text';

function question<I extends ZodObject, O extends ZodObject>(
  definition: ReadOnlyToolDefinition<I, O>,
  handler: ReadOnlyToolHandler<I, O>
): ReadQuestion {
  return {
    definition: definition as unknown as ReadQuestion['definition'],
    handler: handler as unknown as ReadQuestion['handler'],
  };
}

/** The one channel-neutral registry of read questions, in the MCP tools/list order (ADR-0010). */
export const READ_QUESTIONS: readonly ReadQuestion[] = [
  question(overdueTool, overdueHandler),
  question(debtorsTool, debtorsHandler),
  question(expectedPaymentsTool, expectedPaymentsHandler),
  question(summaryTool, summaryHandler),
  question(customersTool, customersHandler),
  question(searchTool, searchHandler),
  question(invoiceTool, invoiceHandler),
  // ai-chat-v2: the draft-request reads, after the ai-assistant seven.
  question(senderProfilesTool, senderProfilesHandler),
];
