// AC-03, AC-01: one email address belongs to exactly one account
// across the Next.js / next-auth / nodemailer upgrade.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Nodemailer from 'next-auth/providers/nodemailer';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { createFreelancer } from '../../support/factories/user';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const require_ = createRequire(import.meta.url);

// Some packages (e.g. @auth/core) do not export ./package.json, so resolve the package entry and
// walk up to the package.json whose name matches.
function installedVersion(pkg: string, from?: string): string {
  let dir = dirname(
    require_.resolve(pkg, from ? { paths: [from] } : undefined)
  );
  for (;;) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      const manifest = JSON.parse(readFileSync(candidate, 'utf8')) as {
        name?: string;
        version: string;
      };
      if (manifest.name === pkg) return manifest.version;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`package.json for ${pkg} not found`);
    dir = parent;
  }
}

function atLeast(actual: string, min: string): boolean {
  const a = actual.split('-')[0].split('.').map(Number);
  const m = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== m[i]) return (a[i] ?? 0) > m[i];
  }
  return true;
}

describe('T1 upgraded component versions (AC-01)', () => {
  it('next is 16.3.x', () => {
    expect(installedVersion('next')).toMatch(/^16\.3\./);
  });

  it('next-auth is 5.0.0-beta.32 with @auth/core >= 0.41.3', () => {
    expect(installedVersion('next-auth')).toBe('5.0.0-beta.32');
    const nextAuthDir = require_.resolve('next-auth/package.json');
    expect(atLeast(installedVersion('@auth/core', nextAuthDir), '0.41.3')).toBe(
      true
    );
  });

  it('nodemailer is 10.x', () => {
    expect(installedVersion('nodemailer')).toMatch(/^10\./);
  });
});

type AuthFn = (
  request: Request,
  config: Record<string, unknown>
) => Promise<Response>;

// @auth/core is a transitive dependency of next-auth, so resolve it from next-auth's location.
async function loadAuthCore(): Promise<{ Auth: AuthFn }> {
  const fromNextAuth = createRequire(
    require_.resolve('next-auth/package.json')
  );
  return (await import(
    pathToFileURL(fromNextAuth.resolve('@auth/core')).href
  )) as { Auth: AuthFn };
}

describe.runIf(containerRuntimeAvailable)(
  'T1 existing account is reused for the same address (AC-03, real DB)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;

    beforeAll(async () => {
      db = await startTestDatabase();
      prisma = createTestPrismaClient(db.connectionString);
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    it('a Sign-in link requested for " ANA@Example.test " is issued for the existing User, no second row', async () => {
      const existing = await createFreelancer(prisma, {
        email: 'ana@example.test',
      });
      const { Auth } = await loadAuthCore();
      const sent: Array<{ identifier: string }> = [];
      const base = 'http://localhost:3000';
      const config = {
        secret: 'test-secret-test-secret-test-secret',
        trustHost: true,
        basePath: '/api/auth',
        adapter: PrismaAdapter(prisma),
        session: { strategy: 'jwt' },
        providers: [
          Nodemailer({
            server: { host: 'localhost', port: 2525 },
            from: 'no-reply@example.test',
            sendVerificationRequest: async (params: { identifier: string }) => {
              sent.push({ identifier: params.identifier });
            },
          }),
        ],
      };

      const csrfRes = await Auth(new Request(`${base}/api/auth/csrf`), config);
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      const cookie = csrfRes.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');

      await Auth(
        new Request(`${base}/api/auth/signin/nodemailer`, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            cookie,
          },
          body: new URLSearchParams({ email: ' ANA@Example.test ', csrfToken }),
        }),
        config
      );

      expect(sent).toEqual([{ identifier: 'ana@example.test' }]);
      const users = await prisma.user.findMany();
      expect(users).toHaveLength(1);
      expect(users[0].id).toBe(existing.id);
    });
  }
);
