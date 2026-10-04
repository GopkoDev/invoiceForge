// T12 (ADR-0003): /api/mcp is the single exact-path exception, besides the sign-in service, that
// lets an anonymous (session-less) request past the proxy; it authenticates itself by Bearer key.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isPublicPath,
  isRefusedAnonymousMutation,
} from '@/config/routes.config';

function routePaths(dir: string, base: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory())
      return routePaths(full, `${base}/${name}`);
    return name === 'route.ts' ? [base] : [];
  });
}

describe('/api/mcp proxy exception (AC-09)', () => {
  it('is public and POSTable anonymously at the exact path only', () => {
    expect(isPublicPath('/api/mcp')).toBe(true);
    expect(isRefusedAnonymousMutation('POST', '/api/mcp')).toBe(false);
    for (const p of [
      '/api/mcp/',
      '/api/mcp/x',
      '/api/mcp-x',
      '/api/mcpx',
      '/api/MCP',
    ]) {
      expect(isPublicPath(p)).toBe(false);
      expect(isRefusedAnonymousMutation('POST', p)).toBe(true);
    }
  });

  it('is the only anonymous-mutation exception among app/api routes besides /api/auth', () => {
    const root = path.join(process.cwd(), 'app', 'api');
    const apiPaths = routePaths(root, '/api').map((p) =>
      p.replace(/\[\.\.\.[^\]]+\]/g, 'x').replace(/\[[^\]]+\]/g, 'x')
    );
    expect(apiPaths).toContain('/api/mcp');
    const open = apiPaths.filter(
      (p) => !isRefusedAnonymousMutation('POST', p)
    );
    expect(open).toContain('/api/mcp');
    expect(
      open.filter((p) => p !== '/api/mcp' && !p.startsWith('/api/auth/'))
    ).toEqual([]);
  });
});
