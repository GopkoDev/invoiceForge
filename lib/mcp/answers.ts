import type {
  ActionErrorDetails,
  ActionFailure,
  AmbiguousCandidate,
} from '@/types/result';

// The one place that turns service results into MCP answers: Freelancer-entered
// text marking (AC-19b) and tool errors. Pure; no I/O.

const MAX_CANDIDATES = 50;

export type FreelancerText = { freelancerText: string };

export function freelancerText(text: string): FreelancerText {
  return { freelancerText: text };
}

export function nullableFreelancerText(text: string | null | undefined): FreelancerText | null {
  return text === null || text === undefined ? null : freelancerText(text);
}

export type ToolErrorDetails =
  | { kind: 'PAGE_OUT_OF_RANGE'; total: number; lastPage: number }
  | {
      kind: 'AMBIGUOUS_REFERENCE';
      reference: 'invoice' | 'customer' | 'senderProfile';
      candidates: Record<string, unknown>[];
    };

export type ToolError = {
  code: 'VALIDATION' | 'NOT_FOUND' | 'FAILED';
  message: string;
  fieldErrors?: Record<string, string[]>;
  details?: ToolErrorDetails;
};

export const FAILED_MESSAGE = 'Invoice Forge could not complete this call. Try again later.';

function candidate(
  reference: 'invoice' | 'customer' | 'senderProfile',
  c: AmbiguousCandidate
): Record<string, unknown> {
  const name = freelancerText(c.name);
  if (reference === 'customer') return { customerId: c.id, name };
  if (reference === 'senderProfile') return { senderProfileId: c.id, name };
  // The contract's InvoiceCandidate (AC-20): the number plus the structured parts that tell
  // two invoices with that number apart.
  return {
    invoiceId: c.id,
    invoiceNumber: c.name,
    senderProfile: c.senderProfile && {
      senderProfileId: c.senderProfile.senderProfileId,
      name: freelancerText(c.senderProfile.name),
    },
    customer: c.customer && {
      customerId: c.customer.customerId,
      name: freelancerText(c.customer.name),
    },
    issueDate: c.issueDate,
  };
}

function toolErrorDetails(details: ActionErrorDetails | undefined): ToolErrorDetails | undefined {
  if (details?.kind === 'PAGE_OUT_OF_RANGE') {
    return { kind: 'PAGE_OUT_OF_RANGE', total: details.total, lastPage: details.lastPage };
  }
  if (details?.kind === 'AMBIGUOUS_REFERENCE') {
    return {
      kind: 'AMBIGUOUS_REFERENCE',
      reference: details.reference,
      candidates: details.candidates
        .slice(0, MAX_CANDIDATES)
        .map((c) => candidate(details.reference, c)),
    };
  }
  return undefined;
}

/** VALIDATION / NOT_FOUND explain what to ask; every other failure is a plain FAILED. */
export function toToolError(failure: ActionFailure): ToolError {
  if (failure.code !== 'VALIDATION' && failure.code !== 'NOT_FOUND') {
    return { code: 'FAILED', message: FAILED_MESSAGE };
  }
  const details = toolErrorDetails(failure.details);
  return {
    code: failure.code,
    message: failure.error,
    ...(failure.fieldErrors ? { fieldErrors: failure.fieldErrors } : {}),
    ...(details ? { details } : {}),
  };
}

export type CallToolResult = {
  isError: boolean;
  content: { type: 'text'; text: string }[];
  structuredContent: Record<string, unknown>;
};

function result(isError: boolean, structured: Record<string, unknown>): CallToolResult {
  return {
    isError,
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

export function toolAnswer(structuredContent: Record<string, unknown>): CallToolResult {
  return result(false, structuredContent);
}

export function toolErrorResult(error: ToolError): CallToolResult {
  return result(true, error);
}
