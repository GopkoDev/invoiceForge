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
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'store'];
const SOURCE = /\.(tsx?|jsx?|mjs)$/;

// next-auth/react exports that mount or call the client session poller. signIn / signOut /
// getCsrfToken / getProviders do not read /api/auth/session.
const SESSION_CLIENT_EXPORTS = ['SessionProvider', 'useSession', 'getSession'];

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.next') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return SOURCE.test(entry.name) ? [full] : [];
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
    const offenders = SCAN_DIRS.flatMap((d) => listFiles(path.join(ROOT, d)))
      .map((f) => ({
        file: rel(f),
        uses: sessionClientUses(fs.readFileSync(f, 'utf8')),
      }))
      .filter(({ uses }) => uses.length > 0);
    expect(offenders).toEqual([]);
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
