// editor-ux T11 (ADR-0003, sad §11 risk «per-mount store»): the module-level editor store is gone and
// importing its old path is a lint error, so a missed consumer cannot compile back to a shared singleton.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const lint = async (filePath: string, code: string) => {
  const [r] = await new ESLint({ cwd: process.cwd() }).lintText(code, { filePath });
  return r.messages.filter((m) => m.ruleId === 'no-restricted-imports');
};

describe('module-level editor store import restriction (T11)', { timeout: 30_000 }, () => {
  it('rejects the old store module path', async () => {
    const m = await lint(
      'components/invoice-editor/probe.tsx',
      "import { useInvoiceEditorStore } from '@/store/invoice-editor-store/use-invoice-editor-store';\nexport const x = useInvoiceEditorStore;\n"
    );
    expect(m).toHaveLength(1);
  });

  it('rejects the relative form of the old store path', async () => {
    const m = await lint(
      'store/invoice-editor-store/probe.ts',
      "import { useInvoiceEditorStore } from './use-invoice-editor-store';\nexport const x = useInvoiceEditorStore;\n"
    );
    expect(m).toHaveLength(1);
  });

  it('rejects the singleton re-exported from the store barrel', async () => {
    const m = await lint(
      'hooks/probe.ts',
      "import { useInvoiceEditorStore } from '@/store/invoice-editor-store';\nexport const x = useInvoiceEditorStore;\n"
    );
    expect(m).toHaveLength(1);
  });

  it('allows the context selectors', async () => {
    const m = await lint(
      'components/invoice-editor/probe.tsx',
      "import { useFormData } from '@/store/invoice-editor-store/selectors';\nexport const x = useFormData;\n"
    );
    expect(m).toHaveLength(0);
  });
});
