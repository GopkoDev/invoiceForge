// R-05 (ai-assistant, AC-11; spec §6 "Model provider outage"): tells a model-provider fault (AI_UNAVAILABLE)
// from a fault on our side (COULD_NOT_COMPLETE), wherever in the turn it happens, the topic router included.
// Every model the chat uses is wrapped so whatever its calls throw, or put in an error part mid-stream, is
// marked as the provider's; the known provider error shapes (APICallError, gateway errors, timeouts, 429/5xx)
// count too, also when the AI SDK or Mastra wraps them (a retry error, a `cause`).
import { APICallError, wrapLanguageModel } from 'ai';
import { GatewayError } from '@ai-sdk/gateway';

type WrappableModel = Parameters<typeof wrapLanguageModel>[0]['model'];

const fromProvider = new WeakSet<object>();

function mark(error: unknown): unknown {
  if (error && typeof error === 'object') fromProvider.add(error);
  return error;
}

/** The model, with every fault of its calls marked as the provider's. */
export function withProviderFaults(model: WrappableModel) {
  return wrapLanguageModel({
    model,
    middleware: {
      wrapGenerate: async ({ doGenerate }) => {
        try {
          return await doGenerate();
        } catch (error) {
          throw mark(error);
        }
      },
      wrapStream: async ({ doStream }) => {
        let result: Awaited<ReturnType<typeof doStream>>;
        try {
          result = await doStream();
        } catch (error) {
          throw mark(error);
        }
        const stream = result.stream.pipeThrough(
          new TransformStream({
            transform(part, controller) {
              if (part.type === 'error') mark(part.error);
              controller.enqueue(part);
            },
          })
        );
        return { ...result, stream };
      },
    },
  });
}

const PROVIDER_ERROR_NAMES = new Set(['TimeoutError', 'AbortError']);

function looksLikeProviderFault(error: object): boolean {
  if (fromProvider.has(error)) return true;
  if (APICallError.isInstance(error) || GatewayError.isInstance(error)) return true;
  const { name, statusCode } = error as { name?: unknown; statusCode?: unknown };
  if (typeof name === 'string' && PROVIDER_ERROR_NAMES.has(name)) return true;
  return typeof statusCode === 'number' && (statusCode === 429 || statusCode >= 500);
}

/** Whether `error` (or anything it wraps) came from the model provider. */
export function isProviderFault(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 5) return false;
  if (looksLikeProviderFault(error)) return true;
  const { cause, lastError, errors } = error as { cause?: unknown; lastError?: unknown; errors?: unknown };
  if (isProviderFault(cause, depth + 1) || isProviderFault(lastError, depth + 1)) return true;
  return Array.isArray(errors) && errors.some((e) => isProviderFault(e, depth + 1));
}
