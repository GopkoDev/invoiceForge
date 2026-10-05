// DoD: "the integration suite provably cannot connect to the .env database (guard test)".
// This runs regardless of Docker availability - it's pure logic, no container needed. The
// comparison logic is proven with synthetic strings (no dependency on a real `.env` file, so
// this stays meaningful in CI where `.env` is rightly absent); the real-`.env` assertions only
// run locally, where the file exists.
import { describe, expect, it } from 'vitest';
import {
  assertNotEnvDatabase,
  getDotEnvDatabaseUrlForGuardTestOnly,
  isSameDatabase,
} from '../support/db/env-guard';

const SYNTHETIC_ENV_URL = 'postgresql://owner:secret@real-host.internal:5432/invoice_forge_prod';
const CONTAINER_SHAPED_URL = 'postgresql://test:test@127.0.0.1:55432/invoice_forge_test';

describe('env-guard comparison logic (always runs, no .env required)', () => {
  it('treats an identical connection string as the same database', () => {
    expect(isSameDatabase(SYNTHETIC_ENV_URL, SYNTHETIC_ENV_URL)).toBe(true);
  });

  it('ignores incidental whitespace and a trailing slash', () => {
    expect(isSameDatabase(`  ${SYNTHETIC_ENV_URL}  `, SYNTHETIC_ENV_URL)).toBe(true);
    expect(isSameDatabase(`${SYNTHETIC_ENV_URL}/`, SYNTHETIC_ENV_URL)).toBe(true);
  });

  it('treats an unrelated (throwaway container-shaped) connection string as different', () => {
    expect(isSameDatabase(CONTAINER_SHAPED_URL, SYNTHETIC_ENV_URL)).toBe(false);
  });

  it('does not throw for an unrelated connection string', () => {
    expect(() => assertNotEnvDatabase(CONTAINER_SHAPED_URL)).not.toThrow();
  });
});

const envUrl = getDotEnvDatabaseUrlForGuardTestOnly();

describe.skipIf(!envUrl)('the real repo .env (local only; absent and skipped in CI)', () => {
  it('assertNotEnvDatabase throws for the exact .env DATABASE_URL', () => {
    expect(() => assertNotEnvDatabase(envUrl as string)).toThrow(
      /Refusing to run[\s\S]*\.env DATABASE_URL/
    );
  });

  it('assertNotEnvDatabase throws even with incidental whitespace differences', () => {
    expect(() => assertNotEnvDatabase(`  ${envUrl}  `)).toThrow();
    expect(() => assertNotEnvDatabase(`${envUrl}/`)).toThrow();
  });
});
