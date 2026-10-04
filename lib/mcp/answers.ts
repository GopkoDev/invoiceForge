import type {
  ActionErrorDetails,
  ActionFailure,
  AmbiguousCandidate,
} from '@/types/result';
import { fail } from '@/types/result';

// The one place that turns service results into MCP answers: paging and completeness,
// Freelancer-entered text marking (AC-19b) and tool errors. Pure; no I/O.

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
const MAX_CANDIDATES = 50;

export type FreelancerText = { freelancerText: string };

export function freelancerText(text: string): FreelancerText {
  return { freelancerText: text };
}

export function nullableFreelancerText(text: string | null | undefined): FreelancerText | null {
  return text === null || text === undefined ? null : freelancerText(text);
}

export type PageInput = { page?: number; pageSize?: number };
export type ResolvedPage = { page: number; pageSize: number; pageSizeCapped: boolean };

export type PageInfo = {
  page: number;
  pageSize: number;
  pageSizeCapped: boolean;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

/** Default 20 rows; above 50 is capped (not refused) and flagged (AC-18). */
export function resolvePageInput(input: PageInput): ResolvedPage {
  const page = Math.max(1, input.page ?? 1);
  const requested = Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE);
  const pageSizeCapped = requested > MAX_PAGE_SIZE;
  return { page, pageSize: Math.min(requested, MAX_PAGE_SIZE), pageSizeCapped };
}

/** Totals always cover the full match set; `hasMore` marks an incomplete answer (AC-17, AC-18). */
export function pageInfo(
  input: ResolvedPage & { total: number }
): PageInfo {
  const totalPages = Math.ceil(input.total / input.pageSize);
  return {
    page: input.page,
    pageSize: input.pageSize,
    pageSizeCapped: input.pageSizeCapped,
    total: input.total,
    totalPages,
    hasMore: input.page < totalPages,
  };
}

/**
 * AC-18b: a page past the end is a refusal with the total and last page, never an earlier page.
 * Page 1 of zero matches is a valid, empty answer. Returns null when the page exists.
 */
export function pageOutOfRange(input: {
  page: number;
  pageSize: number;
  total: number;
}): ActionFailure | null {
  const totalPages = Math.ceil(input.total / input.pageSize);
  const lastPage = Math.max(1, totalPages);
  if (input.page <= lastPage) return null;
  const matches = input.total === 1 ? '1 match' : `${input.total} matches`;
  const where =
    totalPages === 0
      ? `There are 0 matches; ask for page 1.`
      : `There are ${matches} on ${totalPages} ${totalPages === 1 ? 'page' : 'pages'}; ask for page ${
          lastPage === 1 ? '1' : `1 to ${lastPage}`
        }.`;
  return fail('NOT_FOUND', `Page ${input.page} does not exist. ${where}`, {
    details: { kind: 'PAGE_OUT_OF_RANGE', total: input.total, lastPage },
  });
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

export const FAILED_MESSAGE = 'invoiceFlow could not complete this call. Try again later.';

function candidate(
  reference: 'invoice' | 'customer' | 'senderProfile',
  c: AmbiguousCandidate
): Record<string, unknown> {
  const name = freelancerText(c.name);
  const detail = nullableFreelancerText(c.detail);
  if (reference === 'customer') return { customerId: c.id, name };
  if (reference === 'senderProfile') return { senderProfileId: c.id, name };
  return { invoiceId: c.id, name, ...(detail ? { detail } : {}) };
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
