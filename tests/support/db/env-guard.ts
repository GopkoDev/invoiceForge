// Hard guard: integration tests must never connect to the database in the repo's own `.env`
// (test-plan.md §Test data: "it holds the owner's real accounts"). This reads `.env` once, only
// to compare connection strings, and never logs or returns the value to a caller that could
// print it.

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

let cachedEnvDatabaseUrl: string | undefined;
let loaded = false;

function loadDotEnvDatabaseUrl(): string | undefined {
  if (loaded) return cachedEnvDatabaseUrl;
  loaded = true;

  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    cachedEnvDatabaseUrl = undefined;
    return undefined;
  }

  const parsed = dotenv.parse(fs.readFileSync(envPath));
  cachedEnvDatabaseUrl = parsed.DATABASE_URL;
  return cachedEnvDatabaseUrl;
}

export function normalizeConnectionString(connectionString: string): string {
  return connectionString.trim().replace(/\/+$/, '');
}

/** Pure comparison, no filesystem access - safe to unit-test without a real `.env` present. */
export function isSameDatabase(a: string, b: string): boolean {
  return normalizeConnectionString(a) === normalizeConnectionString(b);
}

/**
 * Throws if `connectionString` is the same database as the repo's `.env` DATABASE_URL. Every
 * path that hands a connection string to a real Postgres client (container client construction,
 * migration runner, truncation helper) must call this first.
 */
export function assertNotEnvDatabase(connectionString: string): void {
  const envUrl = loadDotEnvDatabaseUrl();
  if (envUrl && isSameDatabase(connectionString, envUrl)) {
    throw new Error(
      'Refusing to run: this connection string is the .env DATABASE_URL. ' +
        'Integration tests must run against a throwaway container, never the real database.'
    );
  }
}

/** Test-only, for the guard test itself: never print the return value. */
export function getDotEnvDatabaseUrlForGuardTestOnly(): string | undefined {
  return loadDotEnvDatabaseUrl();
}
