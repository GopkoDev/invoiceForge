// editor-ux T2 (ADR-0001, sad §8 "On-demand code"): the PDF toolkit is imported only inside lib/pdf/.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const lint = async (filePath: string, code: string) => {
  const [r] = await new ESLint({ cwd: process.cwd() }).lintText(code, { filePath });
  return r.messages.filter((m) => m.ruleId === 'no-restricted-imports');
};

describe('PDF toolkit import restriction (T2)', { timeout: 30_000 }, () => {
  it('rejects a static @react-pdf/renderer import outside lib/pdf', async () => {
    const m = await lint('components/probe.tsx', "import { pdf } from '@react-pdf/renderer';\nexport const x = pdf;\n");
    expect(m).toHaveLength(1);
  });

  it('rejects a static import of the kit module outside lib/pdf', async () => {
    const m = await lint('hooks/probe.ts', "import { generatePdfBlob } from '@/lib/pdf/invoice-pdf-kit';\nexport const x = generatePdfBlob;\n");
    expect(m).toHaveLength(1);
  });

  it('allows the toolkit import inside lib/pdf', async () => {
    const m = await lint('lib/pdf/probe.tsx', "import { pdf } from '@react-pdf/renderer';\nexport const x = pdf;\n");
    expect(m).toHaveLength(0);
  });

  it('allows the lazy loader import anywhere', async () => {
    const m = await lint('hooks/probe.ts', "import { loadPdfKit } from '@/lib/pdf/load-pdf-kit';\nexport const x = loadPdfKit;\n");
    expect(m).toHaveLength(0);
  });
});
