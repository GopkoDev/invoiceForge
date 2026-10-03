// Prisma clients that fail in one chosen way, for the AC-15 fail-closed tests (security-patch
// re-review R-02, R-03). Errors carry no address or network address.
import type { PrismaClient } from '@prisma/client';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const bound = (target: object, prop: string | symbol): unknown => {
  const value = Reflect.get(target, prop);
  return typeof value === 'function' ? value.bind(target) : value;
};

/**
 * R-02: only the SIGNIN_SOURCE advisory-lock statement fails; every other statement, the
 * SIGNIN_ADDRESS lock included, runs on the real database.
 */
export function sourceStoreDown(real: PrismaClient): PrismaClient {
  return new Proxy(real, {
    get(target, prop) {
      if (prop !== '$transaction') return bound(target, prop);
      return (fn: (tx: PrismaClient) => Promise<unknown>, options?: object) =>
        target.$transaction(
          (tx) =>
            fn(
              new Proxy(tx as PrismaClient, {
                get(t, p) {
                  if (p !== '$executeRaw') return bound(t, p);
                  return (strings: TemplateStringsArray, ...values: unknown[]) =>
                    values[0] === 'SIGNIN_SOURCE'
                      ? Promise.reject(new Error('connection reset'))
                      : t.$executeRaw(strings, ...values);
                },
              })
            ),
          options
        );
    },
  });
}

/**
 * R-03: a database that refuses every connection, for the limit store and the Auth.js adapter
 * alike. The refusal takes a moment, like a real connection attempt.
 */
const unreachable = async () => {
  await pause(20);
  throw new Error('connection refused');
};

export const databaseDown = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === 'then') return undefined;
      return String(prop).startsWith('$')
        ? unreachable
        : new Proxy({}, { get: () => unreachable });
    },
  }
) as unknown as PrismaClient;
