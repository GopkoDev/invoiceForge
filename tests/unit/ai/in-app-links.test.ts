// T62 (ai-chat-v2; AC-43, ADR-0012): the in-app link allowlist is built from route patterns.
// Seam: lib/ai/in-app-links.ts exports `isInAppPath(href: string): boolean`.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isInAppPath } from '@/lib/ai/in-app-links';

describe('isInAppPath', () => {
  it.each([
    '/dashboard',
    '/invoices',
    '/invoices/abc123/edit',
    '/invoices/new',
    '/customers',
    '/customers/c_1-x',
    '/customers/new',
    '/products',
    '/products/p1/edit',
    '/products/new',
    '/sender-profiles',
    '/sender-profiles/s1',
    '/sender-profiles/s1/edit/bank-accounts',
    '/settings/profile',
    '/settings/privacy',
    '/settings/assistants',
    '/ai',
    '/ai/conv-1',
  ])('accepts %s', (p) => {
    expect(isInAppPath(p)).toBe(true);
  });

  it.each([
    '/invoices/abc/edit?x=1',
    '/invoices/abc/edit#top',
    '/invoices/../settings/profile',
    '/invoices/abc/../edit',
    '/invoices/%2e%2e/edit',
    '/invoices//edit',
    '/invoices/a b/edit',
    '/invoices/' + 'a'.repeat(65) + '/edit',
    '/invoices/abc/edit/',
    '/unknown',
    '/api/chat',
    '/login',
    '/settings',
    '/invoices/abc',
    '//evil.example',
    '//evil.example/invoices',
    'https://evil.example/invoices',
    'https://app.example.com/invoices',
    'http://localhost:3000/invoices',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'mailto:a@b.co',
    'invoices',
    '\\evil.example',
    '/\\evil.example',
    '',
    ' /invoices',
    '/invoices\n',
  ])('refuses %j', (p) => {
    expect(isInAppPath(p)).toBe(false);
  });

  it('accepts an id of exactly 64 characters', () => {
    expect(isInAppPath(`/invoices/${'a'.repeat(64)}/edit`)).toBe(true);
  });
});

describe('Markdown dependency pins (ADR-0012 hard rule)', () => {
  const pkg = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8')
  ) as { dependencies?: Record<string, string> };

  it('pins react-markdown exactly 10.1.0', () => {
    expect(pkg.dependencies?.['react-markdown']).toBe('10.1.0');
  });
  it('pins remark-gfm exactly 4.0.1', () => {
    expect(pkg.dependencies?.['remark-gfm']).toBe('4.0.1');
  });
});
