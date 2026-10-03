// T31 (spec.md §5 AC-04; re-review 2026-10-03 R-01): a failed sign-in check must never end a
// session. Auth.js's own session endpoint (GET /api/auth/session) clears the session cookie when it
// cannot verify the token, and that route-handler response is not filtered by the proxy. The only
// thing that ever called it was next-auth/react's SessionProvider in the root layout, which fetches
// it on every mount and every tab focus. Nothing reads the client session (no useSession), so the
// provider is gone; this scan keeps it, and any other client-side read of that endpoint, gone.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SOURCE = /\.(tsx?|jsx?|mjs)$/;
// T40 (S-04): the walk starts at the repo root with the guard scan's skips, so root files
// (instrumentation-client.ts) and folders added later (config/, constants/) are covered. Never
// source the app ships: dependencies, build output, VCS and tool state at any depth, and the
// repo-root folders of docs, tests and test/report output.
// Server-side files that name the endpoint as a string and fetch nothing: the public-path
// allowlist, and the route that strips the cookie expiry from the endpoint's own response (T40).
const SERVER_SIDE_MENTIONS = new Set([
  'config/routes.config.ts',
  'app/api/auth/[...nextauth]/route.ts',
]);
const SKIP_ANYWHERE = new Set(['node_modules', '.next', '.git', '.claude']);
const SKIP_AT_ROOT = new Set([
  'docs',
  'tests',
  'test-results',
  'playwright-report',
  'coverage',
]);

// next-auth/react exports that mount or call the client session poller. signIn / signOut /
// getCsrfToken / getProviders do not read /api/auth/session.
const SESSION_CLIENT_EXPORTS = ['SessionProvider', 'useSession', 'getSession'];

function listFiles(dir: string, root = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_ANYWHERE.has(entry.name)) return [];
      if (dir === root && SKIP_AT_ROOT.has(entry.name)) return [];
      return listFiles(full, root);
    }
    return entry.isFile() && SOURCE.test(entry.name) ? [full] : [];
  });
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');

/** The session-client names a file imports from next-auth/react, or a local wrapper of them. */
function sessionClientUses(source: string): string[] {
  const found: string[] = [];
  const importRe =
    /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]next-auth\/react['"]/g;
  for (const match of source.matchAll(importRe)) {
    if (/^\s*import\s+type\b/.test(match[0])) continue;
    for (const spec of match[1].split(',')) {
      const name = spec
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0];
      if (SESSION_CLIENT_EXPORTS.includes(name)) found.push(name);
    }
  }
  if (/import\s+\*\s+as\s+\w+\s+from\s*['"]next-auth\/react['"]/.test(source))
    found.push('namespace import');
  if (/['"]@\/components\/session-provider['"]/.test(source))
    found.push('@/components/session-provider');
  if (/<SessionProvider\b/.test(source)) found.push('<SessionProvider>');
  if (/['"`][^'"`\n]*\/api\/auth\/session\b/.test(source))
    found.push('/api/auth/session');
  return found;
}

describe('no client-side session fetch (AC-04, R-01)', () => {
  it('the root layout mounts no session provider', () => {
    const layout = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');
    expect(sessionClientUses(layout)).toEqual([]);
  });

  it('no app source mounts the session poller or fetches /api/auth/session', () => {
    const offenders = listFiles(ROOT)
      .map((f) => ({
        file: rel(f),
        uses: sessionClientUses(fs.readFileSync(f, 'utf8')).filter(
          (use) =>
            !(SERVER_SIDE_MENTIONS.has(rel(f)) && use === '/api/auth/session')
        ),
      }))
      .filter(({ uses }) => uses.length > 0);
    expect(offenders).toEqual([]);
  });

  it('the walk covers root files and folders the old directory list missed', () => {
    const scanned = listFiles(ROOT).map(rel);
    expect(scanned).toContain('instrumentation-client.ts');
    expect(scanned.some((f) => f.startsWith('config/'))).toBe(true);
    expect(scanned.some((f) => f.startsWith('constants/'))).toBe(true);
    expect(scanned.some((f) => f.startsWith('node_modules/'))).toBe(false);
    expect(scanned.some((f) => f.startsWith('tests/'))).toBe(false);
  });

  describe('planted shapes', () => {
    it('flags the provider, the hooks, the wrapper module and a direct fetch', () => {
      expect(
        sessionClientUses(
          `import { SessionProvider as P, signOut } from 'next-auth/react';`
        )
      ).toEqual(['SessionProvider']);
      expect(
        sessionClientUses(`import { useSession } from "next-auth/react";`)
      ).toEqual(['useSession']);
      expect(
        sessionClientUses(
          `import { getSession, signIn } from 'next-auth/react';`
        )
      ).toEqual(['getSession']);
      expect(
        sessionClientUses(`import * as auth from 'next-auth/react';`)
      ).toEqual(['namespace import']);
      expect(
        sessionClientUses(
          `import { SessionProvider } from '@/components/session-provider';\n<SessionProvider>{children}</SessionProvider>`
        )
      ).toEqual(['@/components/session-provider', '<SessionProvider>']);
      expect(sessionClientUses("await fetch('/api/auth/session');")).toEqual([
        '/api/auth/session',
      ]);
    });

    it('passes signOut / signIn and type-only imports', () => {
      expect(
        sessionClientUses(`import { signOut, signIn } from 'next-auth/react';`)
      ).toEqual([]);
      expect(
        sessionClientUses(`import type { Session } from 'next-auth';`)
      ).toEqual([]);
    });
  });
});
