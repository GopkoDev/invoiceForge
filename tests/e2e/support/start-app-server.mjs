// Boots the REAL app (a production build, test-plan.md "E2E" row) for playwright.config.ts's
// second `webServer` entry — Review 2026-09-27 F-12: the AC-05 route sweep needs the actual
// Next.js app behind the proxy, not the static page the harness smoke test serves.
//
// Run as a raw shell command by Playwright (webServer.command), so it can't go through
// Playwright's own TypeScript loader the way playwright.config.ts or a spec file can — this is
// deliberately plain, dependency-light JS rather than importing the tests/support/db/*.ts
// helpers those need a TS loader for.
//
// If no container runtime answers, this starts a tiny placeholder server instead of the real
// app (which needs a live DATABASE_URL to boot) so Playwright's webServer readiness check still
// succeeds and the harness's other e2e projects are unaffected. The route-sweep spec itself
// re-checks the container runtime (same `skipWithoutContainerRuntime` helper the smoke test
// uses) and skips cleanly rather than trusting this placeholder's responses.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSinkCertificate,
  MAIL_SINK_HOST,
  MAIL_SINK_PORT,
  startMailSink,
} from './mail-sink.mjs';

const PORT = Number(process.env.APP_E2E_PORT ?? 4311);
// Matches tests/e2e/support/app-server.ts BROKEN_CHECK_PORT.
const BROKEN_CHECK_PORT = Number(process.env.APP_E2E_BROKEN_CHECK_PORT ?? 4312);
const PROBE_TIMEOUT_MS = 4000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
// Shared with the specs (tests/e2e/support/app-server.ts E2E_RUNTIME_DIR): the throwaway database
// URL and the mail sink's inbox, so a spec can seed data and read the Sign-in link.
const runtimeDir = path.join(os.tmpdir(), 'invoice-forge-e2e');

async function isDockerAvailable() {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    let child;
    try {
      child = spawn('docker', ['version', '--format', '{{.Server.Version}}'], {
        stdio: 'ignore',
      });
    } catch {
      settle(false);
      return;
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      settle(false);
    }, PROBE_TIMEOUT_MS);
    child.on('error', () => {
      clearTimeout(timer);
      settle(false);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      settle(code === 0);
    });
  });
}

function startPlaceholderServer() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ skipped: true, reason: 'no container runtime' }));
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(
      `[e2e app server] no container runtime — placeholder listening on ${PORT}`
    );
  });
}

async function startRealApp() {
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');

  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('invoice_forge_e2e')
    .withUsername('test')
    .withPassword('test')
    .start();
  const connectionString = container.getConnectionUri();

  // The Sign-in link goes through the app's real TLS-only mail transport to a local sink.
  fs.rmSync(runtimeDir, { recursive: true, force: true });
  const mailDir = path.join(runtimeDir, 'mail');
  const { key, cert } = createSinkCertificate(runtimeDir);
  const mailSink = startMailSink({ dir: mailDir, key, cert });
  fs.writeFileSync(
    path.join(runtimeDir, 'runtime.json'),
    JSON.stringify({ databaseUrl: connectionString, mailDir })
  );

  const appEnv = {
    ...process.env,
    DATABASE_URL: connectionString,
    NODE_ENV: 'production',
    // Fixed throwaway values: the e2e app never reaches Google, a real SMTP host or Sentry.
    AUTH_GOOGLE_ID: 'e2e-google-id',
    AUTH_GOOGLE_SECRET: 'e2e-google-secret',
    EMAIL_SERVER_HOST: MAIL_SINK_HOST,
    EMAIL_SERVER_PORT: String(MAIL_SINK_PORT),
    EMAIL_SERVER_USER: 'e2e',
    EMAIL_SERVER_PASSWORD: 'e2e',
    CRON_SECRET: 'e2e-cron-secret-do-not-use-in-prod',
    LIMIT_KEY_SECRET: 'e2e-limit-key-secret-do-not-use-in-prod',
    NODE_EXTRA_CA_CERTS: cert,
    AUTH_SECRET:
      process.env.AUTH_SECRET || 'e2e-route-sweep-secret-do-not-use-in-prod',
    AUTH_URL: `http://127.0.0.1:${PORT}`,
    PORT: String(PORT),
  };

  console.log(
    '[e2e app server] applying migrations to the throwaway container...'
  );
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: repoRoot,
    env: appEnv,
    stdio: 'inherit',
  });

  console.log('[e2e app server] building the app (production build)...');
  execFileSync('pnpm', ['exec', 'next', 'build'], {
    cwd: repoRoot,
    env: appEnv,
    stdio: 'inherit',
  });

  console.log('[e2e app server] starting the built app...');
  const server = spawn('pnpm', ['exec', 'next', 'start', '-p', String(PORT)], {
    cwd: repoRoot,
    env: appEnv,
    stdio: 'inherit',
  });

  // AC-04, AC-06: the same build and database, booted with a different AUTH_SECRET — the
  // misconfiguration AC-04 names — so every session check fails there. Cookies are scoped to the
  // host, not the port, so a spec holding a session from the server above can watch a failed check
  // here and its recovery there with the very same cookie.
  const brokenCheckServer = spawn(
    'pnpm',
    ['exec', 'next', 'start', '-p', String(BROKEN_CHECK_PORT)],
    {
      cwd: repoRoot,
      env: {
        ...appEnv,
        AUTH_SECRET: 'e2e-a-different-secret-so-every-check-fails',
        AUTH_URL: `http://127.0.0.1:${BROKEN_CHECK_PORT}`,
        PORT: String(BROKEN_CHECK_PORT),
      },
      stdio: 'inherit',
    }
  );

  const stop = async () => {
    server.kill('SIGTERM');
    brokenCheckServer.kill('SIGTERM');
    mailSink.close();
    await container.stop();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  server.on('exit', (code) => {
    console.log(`[e2e app server] next start exited with ${code}`);
  });
}

const dockerAvailable = await isDockerAvailable();
if (!dockerAvailable) {
  startPlaceholderServer();
} else {
  await startRealApp();
}
