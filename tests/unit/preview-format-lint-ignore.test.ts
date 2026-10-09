// editor-ux T10 — the temporary T8 lint ignore for the preview document is gone: the preview now lays out
// the model, so ad-hoc formatting there is rejected like in the rest of components/.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

describe('preview document is no longer exempt from the format rule', () => {
  it('rejects toFixed in components/invoice-editor/pdf-preview-document.tsx', async () => {
    const [r] = await new ESLint({ cwd: process.cwd() }).lintText(
      'export const x = (n: number) => n.toFixed(2);\n',
      { filePath: 'components/invoice-editor/pdf-preview-document.tsx' },
    );
    expect(r.messages.filter((m) => m.ruleId === 'no-restricted-syntax')).toHaveLength(1);
  });
});
