// Studio only (`pnpm studio`): the app's server modules start with `import 'server-only'`, which throws
// outside Next's server build, and import `@sentry/nextjs`, which has no plain-Node entry. This resolve
// hook turns the first into an empty module and the second into a no-op (Studio reports nothing).
import { register } from 'node:module';

const sentryStub = `
export const captureException = () => undefined;
export const startSpan = (_options, callback) => callback({ setAttribute() {}, setAttributes() {}, end() {} });
`;

const hook = `export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true };
  if (specifier === '@sentry/nextjs') {
    return { url: 'data:text/javascript,' + ${JSON.stringify(encodeURIComponent(sentryStub))}, shortCircuit: true };
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`);
