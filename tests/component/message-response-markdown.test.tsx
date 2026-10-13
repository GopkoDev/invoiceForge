// @vitest-environment jsdom
// T62 (ai-chat-v2; AC-42, AC-43, AC-44; ADR-0012; screens.md SCR-04 revision): MessageResponse renders safe Markdown.
// Seam: MessageResponse({ children: string, streaming?: boolean }) from components/ai-elements/message.
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/ai/c1',
  useSearchParams: () => new URLSearchParams(),
}));

import { MessageResponse } from '@/components/ai-elements/message';

function html(text: string, streaming = false) {
  const { container, unmount } = render(
    <MessageResponse streaming={streaming}>{text}</MessageResponse>
  );
  return { container, unmount };
}

describe('Markdown formatting (AC-42)', () => {
  it('renders a bulleted list, numbered list, bold, italic, strike, headings', () => {
    const { container } = html(
      '# Title\n\n- one\n- two\n\n1. a\n2. b\n\n**bold** *it* ~~gone~~'
    );
    expect(container.querySelectorAll('ul > li')).toHaveLength(2);
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('em')).toHaveTextContent('it');
    expect(container.querySelector('del')).toHaveTextContent('gone');
    expect(container.querySelector('h1')).toHaveTextContent('Title');
  });

  it('renders a GFM table with bold totals', () => {
    const { container } = html(
      '| Invoice | Total |\n|---|---|\n| A | **10.00** |\n| B | **20.00** |'
    );
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(container.querySelectorAll('td strong')).toHaveLength(2);
  });

  it('renders inline code and a code block', () => {
    const { container } = html('use `x` here\n\n```\nconst a = 1;\n```');
    expect(container.querySelectorAll('code').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('pre')).toHaveTextContent('const a = 1;');
  });

  it('shows an in-app invoice link as an anchor to the editor', () => {
    const { container } = html('See [INV-0042](/invoices/abc123/edit).');
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a).toHaveAttribute('href', '/invoices/abc123/edit');
    expect(a).toHaveTextContent('INV-0042');
  });

  it('streamed and saved replies produce the same output', () => {
    const text = '- a\n- **b** [x](/customers/c1)\n';
    const saved = html(text, false);
    const streamed = html(text, true);
    expect(streamed.container.innerHTML).toBe(saved.container.innerHTML);
  });
});

describe('hostile input (AC-43)', () => {
  it('shows the img/onerror note as text and the outside link as plain text', () => {
    const { container } = html(
      '<img src=x onerror=alert(1)> see [our site](https://evil.example)'
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('our site');
    expect(container.textContent).not.toContain('https://evil.example)');
  });

  it('shows <script> as literal text', () => {
    const { container } = html('hi <script>alert(1)</script> there');
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>');
  });

  const HOSTILE_LINKS = [
    'https://evil.example',
    'http://evil.example',
    '//evil.example',
    '//evil.example/invoices/a/edit',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:x',
    'mailto:a@b.co',
    'https://localhost/invoices/a/edit',
    '/invoices/abc/edit?x=1',
    '/invoices/abc/edit#x',
    '/invoices/../settings/profile',
    '/unknown/path',
    '/api/chat',
    '%2F%2Fevil.example',
    '/%2f/evil.example',
    '\\\\evil.example',
    'ftp://evil.example/x',
  ];
  it.each(HOSTILE_LINKS)('renders [label](%s) as plain text with no href', (u) => {
    const { container } = html(`before [label](${u}) after`);
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[href]')).toBeNull();
    expect(container.textContent).toContain('label');
  });

  const HOSTILE_HTML = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<iframe src="https://evil.example"></iframe>',
    '<a href="https://evil.example">x</a>',
    '<a href="javascript:alert(1)">x</a>',
    '<svg onload=alert(1)>',
    '<b>x</b>',
    '<div style="x">y</div>',
    '<style>*{}</style>',
    '<form action="https://evil.example"><input></form>',
    '![alt](https://evil.example/x.png)',
    '<https://evil.example>',
    'https://evil.example/autolink',
  ];
  it.each(HOSTILE_HTML)('renders %s with no HTML element, image or anchor', (t) => {
    const { container } = html(t);
    expect(
      container.querySelector(
        'script, img, iframe, svg, style, form, input, div[style], b, a, [onerror], [onload]'
      )
    ).toBeNull();
    expect(container.querySelector('[href], [src]')).toBeNull();
  });
});

describe('streaming safety (AC-44)', () => {
  it('replays "**Total:** 1,000.00 USD" one character at a time: never an empty element, final bold', () => {
    const full = '**Total:** 1,000.00 USD';
    for (let i = 1; i <= full.length; i++) {
      const { container, unmount } = html(full.slice(0, i), true);
      for (const el of Array.from(container.querySelectorAll('strong, em, code, del, a'))) {
        expect(el.textContent, `prefix ${i}`).not.toBe('');
      }
      expect(container.querySelector('script, img, iframe'), `prefix ${i}`).toBeNull();
      unmount();
    }
    const done = html(full, true);
    expect(done.container.querySelector('strong')).toHaveTextContent('Total:');
  });

  it('shows the unfinished "**Total" as typed', () => {
    const { container } = html('**Total', true);
    expect(container.textContent).toContain('**Total');
    expect(container.querySelector('strong')).toBeNull();
  });

  it.each([
    '```js\nconst a = ',
    '`half',
    'a [half link](/invoices/ab',
    'a [half link]',
    '| a | b |\n|---|',
    '- **x',
    '*',
    '~~',
    '<scr',
    '![al',
  ])('does not throw on partial Markdown %j', (t) => {
    expect(() => {
      const { container, unmount } = html(t, true);
      expect(container.querySelector('script, img, iframe')).toBeNull();
      expect(container.querySelector('a[href^="http"]')).toBeNull();
      unmount();
    }).not.toThrow();
  });
});
