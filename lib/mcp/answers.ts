import type { DraftIssue } from '@/lib/services/assistant-drafts/schema';
import type {
  ActionErrorDetails,
  ActionFailure,
  AmbiguousCandidate,
} from '@/types/result';
import { freelancerText } from '@/lib/assistant-tools/freelancer-text';

// The one place that turns service results into MCP answers: Freelancer-entered
// text marking (mcp-server AC-19b) and tool errors. Pure; no I/O.

const MAX_CANDIDATES = 50;

export { freelancerText, nullableFreelancerText, type FreelancerText } from '@/lib/assistant-tools/freelancer-text';

export type ToolErrorDetails =
  | { kind: 'DRAFT_ISSUES'; issues: DraftIssue[] }
  | { kind: 'DRAFT_LIMIT_REACHED'; created: number; allowance: number; renewsAt: string }
  | { kind: 'PAGE_OUT_OF_RANGE'; total: number; lastPage: number }
  | {
      kind: 'AMBIGUOUS_REFERENCE';
      reference: 'invoice' | 'customer' | 'senderProfile';
      candidates: Record<string, unknown>[];
    };

export type ToolError = {
  code: 'VALIDATION' | 'NOT_FOUND' | 'FORBIDDEN' | 'RATE_LIMITED' | 'CONFLICT' | 'FAILED';
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
  if (details?.kind === 'DRAFT_ISSUES') return { kind: 'DRAFT_ISSUES', issues: details.issues };
  if (details?.kind === 'DRAFT_LIMIT_REACHED') {
    return {
      kind: 'DRAFT_LIMIT_REACHED',
      created: details.created,
      allowance: details.allowance,
      renewsAt: details.renewsAt,
    };
  }
  return undefined;
}

const FORBIDDEN_MESSAGE =
  'This key can only read. To create drafts, the Freelancer can create a new key with Draft permission on the Connect your AI page.';

/** The codes that explain what to do next; every other failure is a plain FAILED. */
export function toToolError(failure: ActionFailure): ToolError {
  if (failure.code === 'FORBIDDEN') return { code: 'FORBIDDEN', message: FORBIDDEN_MESSAGE };
  if (failure.code === 'RATE_LIMITED') {
    const details = toolErrorDetails(failure.details);
    if (details?.kind !== 'DRAFT_LIMIT_REACHED') return { code: 'FAILED', message: FAILED_MESSAGE };
    return {
      code: 'RATE_LIMITED',
      message: `This key has created ${details.created} drafts today, its daily limit. The Freelancer can lift it on the Connect your AI page. Reading still works.`,
      details,
    };
  }
  if (failure.code !== 'VALIDATION' && failure.code !== 'NOT_FOUND' && failure.code !== 'CONFLICT') {
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
