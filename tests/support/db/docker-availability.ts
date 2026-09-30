// Detects whether a container runtime answers, with a short hard timeout, so the integration
// and e2e suites can report "skipped: no container runtime" instead of hanging or falling back
// to any real database. `docker version` on a Docker Desktop that isn't running yet can hang
// indefinitely rather than fail fast, so we race it against a timeout ourselves.

import { spawn } from 'node:child_process';

const PROBE_TIMEOUT_MS = 4000;

let cached: Promise<boolean> | undefined;

/** Memoized for the lifetime of the process: one probe per test run, not per test file. */
export function isContainerRuntimeAvailable(): Promise<boolean> {
  if (!cached) {
    cached = probe();
  }
  return cached;
}

/** Test-only: forces the next call to re-probe. */
export function resetContainerRuntimeAvailabilityCache(): void {
  cached = undefined;
}

function probe(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (ok: boolean) => {
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
