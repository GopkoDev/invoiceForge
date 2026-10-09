// editor-ux T8 (AC-08, AC-09; ADR-0006): display formatting goes only through lib/format, so lint
// rejects toFixed( and toLocale*String( in components/ and app/ (components/ui and lib/format excepted).
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const lint = async (filePath: string, code: string) => {
  const [r] = await new ESLint({ cwd: process.cwd() }).lintText(code, { filePath });
  return r.messages.filter((m) => m.severity === 2 && m.ruleId === 'no-restricted-syntax');
};

const toFixedCode = 'export const x = (n: number) => n.toFixed(2);\n';
const dateCode = 'export const x = (d: Date) => d.toLocaleDateString();\n';
const stringCode = 'export const x = (n: number) => n.toLocaleString();\n';
const timeCode = "export const x = (d: Date) => d.toLocaleTimeString('en-US');\n";

describe('ad-hoc display formatting lint (T8)', () => {
  it.each([
    ['toFixed', toFixedCode],
    ['toLocaleDateString', dateCode],
    ['toLocaleString', stringCode],
    ['toLocaleTimeString', timeCode],
  ])('rejects %s( in components/', async (_name, code) => {
    expect(await lint('components/invoices/probe.tsx', code)).toHaveLength(1);
  });

  it('rejects toFixed( in app/', async () => {
    expect(await lint('app/(protected)/probe.tsx', toFixedCode)).toHaveLength(1);
  });

  it('rejects toLocaleDateString( in app/', async () => {
    expect(await lint('app/(protected)/probe.tsx', dateCode)).toHaveLength(1);
  });

  it('still rejects the ActingFreelancer cast (existing rule is kept)', async () => {
    const m = await lint('components/probe.tsx', 'declare const a: unknown;\nexport const x = a as ActingFreelancer;\n');
    expect(m).toHaveLength(1);
  });

  it('allows these calls in components/ui (third-party primitives)', async () => {
    expect(await lint('components/ui/probe.tsx', toFixedCode)).toHaveLength(0);
    expect(await lint('components/ui/probe.tsx', stringCode)).toHaveLength(0);
  });

  it('allows these calls outside components/ and app/ (lib/format itself)', async () => {
    expect(await lint('lib/format/probe.ts', toFixedCode)).toHaveLength(0);
    expect(await lint('lib/format/probe.ts', dateCode)).toHaveLength(0);
  });

  it('temporarily ignores the preview document (left to T10)', async () => {
    expect(await lint('components/invoice-editor/pdf-preview-document.tsx', toFixedCode)).toHaveLength(0);
  });
});
