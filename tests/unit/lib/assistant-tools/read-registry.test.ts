import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The registered tools reach the business layer, which needs a database connection to load.
vi.mock('@/lib/services/dashboard/assistant-reads', () => ({}));
vi.mock('@/lib/services/customers/customers', () => ({}));
vi.mock('@/lib/services/invoices/assistant-search', () => ({}));
vi.mock('@/lib/services/invoices/find-by-reference', () => ({}));

const root = process.cwd();

// T02 (ai-assistant, AC-02, ADR-0010): one channel-neutral read-tool registry.
describe('lib/assistant-tools read registry (T02)', () => {
  it('exposes the seven read questions in the MCP tools/list order', async () => {
    const { READ_QUESTIONS } = await import('@/lib/assistant-tools');
    expect(READ_QUESTIONS.map((q) => q.definition.name)).toEqual([
      'list_overdue_invoices',
      'list_debtors',
      'list_expected_payments',
      'get_summary_figures',
      'list_customers',
      'search_invoices',
      'get_invoice',
    ]);
    for (const q of READ_QUESTIONS) expect(typeof q.handler).toBe('function');
  });

  it('lib/mcp/tools holds no read-tool definition', () => {
    const dir = join(root, 'lib/mcp/tools');
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.ts')) : [];
    expect(files).toEqual([]);
  });

  it('lib/mcp/server.ts registers the tools from lib/assistant-tools', () => {
    const src = readFileSync(join(root, 'lib/mcp/server.ts'), 'utf8');
    expect(src).toMatch(/@\/lib\/assistant-tools/);
    expect(src).not.toMatch(/@\/lib\/mcp\/tools\//);
  });

  it('lib/assistant-tools does not import from lib/mcp', () => {
    const dir = join(root, 'lib/assistant-tools');
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.ts')) : [];
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => /from\s+['"]@\/lib\/mcp/.test(readFileSync(join(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
