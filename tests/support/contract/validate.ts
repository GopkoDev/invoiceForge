// Validates a response body/status against contracts/openapi.yaml by operationId (checklist:
// "Contract helper: validate a response against contracts/openapi.yaml by operationId").
// Dereferences the spec once with @apidevtools/swagger-parser (resolves $refs, including
// components/schemas), then compiles the relevant response schema with ajv (OpenAPI 3.1 schemas
// are JSON Schema 2020-12).

import path from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

// One spec per feature; an operationId is looked up in each in turn.
const SPEC_PATHS = [
  'docs/features/architecture-hardening/contracts/openapi.yaml',
  'docs/features/security-patch/contracts/openapi.yaml',
].map((p) => path.resolve(process.cwd(), p));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenApiDocument = any;

let documentsPromise: Promise<OpenApiDocument[]> | undefined;

function loadDocuments(): Promise<OpenApiDocument[]> {
  if (!documentsPromise) {
    documentsPromise = Promise.all(
      SPEC_PATHS.map((specPath) => SwaggerParser.dereference(specPath) as Promise<OpenApiDocument>)
    );
  }
  return documentsPromise;
}

/** The security-patch contract (adds RATE_LIMITED / 429 on exportUserData). */
export const SECURITY_PATCH_SPEC_PATH = path.resolve(
  process.cwd(),
  'docs/features/security-patch/contracts/openapi.yaml'
);

function findOperation(
  docs: OpenApiDocument[],
  operationId: string
): { route: string; method: string; operation: OpenApiDocument } {
  for (const doc of docs) {
    for (const [route, methods] of Object.entries<OpenApiDocument>(doc.paths ?? {})) {
      for (const [method, operation] of Object.entries<OpenApiDocument>(methods ?? {})) {
        if (operation && typeof operation === 'object' && operation.operationId === operationId) {
          return { route, method, operation };
        }
      }
    }
  }
  throw new Error(
    `assertMatchesContract: no operationId "${operationId}" in ${SPEC_PATHS.join(', ')}`
  );
}

export interface AssertMatchesContractParams {
  operationId: string;
  status: number;
  body: unknown;
  contentType?: string;
  /** Absolute path of one openapi file to validate against; defaults to searching every feature spec. */
  specPath?: string;
}

/**
 * Throws with a readable diff if `body` doesn't match the schema openapi.yaml documents for
 * `operationId`'s `status` response. A documented response with no schema for the content type
 * (e.g. a $ref-only response, or a status with no body) is treated as "nothing to check".
 */
export async function assertMatchesContract(params: AssertMatchesContractParams): Promise<void> {
  const docs = params.specPath
    ? [await SwaggerParser.dereference(params.specPath) as OpenApiDocument]
    : await loadDocuments();
  const { operation, route } = findOperation(docs, params.operationId);

  const response = operation.responses?.[String(params.status)];
  if (!response) {
    throw new Error(
      `assertMatchesContract: ${params.operationId} (${route}) has no documented response for status ${params.status}`
    );
  }

  const contentType = params.contentType ?? 'application/json';
  const media = response.content?.[contentType];
  const schema = media?.schema;
  if (!schema) {
    return;
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(params.body);
  if (!valid) {
    throw new Error(
      `assertMatchesContract: response for ${params.operationId} ${params.status} does not match the contract:\n` +
        JSON.stringify(validate.errors, null, 2)
    );
  }
}
