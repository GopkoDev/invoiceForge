import { describe, expect, it } from 'vitest';
import { assertMatchesContract } from '../support/contract/validate';

describe('assertMatchesContract (contract smoke)', () => {
  it('accepts a body that matches the documented schema', async () => {
    await expect(
      assertMatchesContract({
        operationId: 'convertLogoImage',
        status: 200,
        body: {
          success: true,
          data: {
            dataUrl: 'data:image/png;base64,AAAA',
            contentType: 'image/png',
            size: 4,
          },
        },
      })
    ).resolves.toBeUndefined();
  });

  it('rejects a body that violates the documented schema', async () => {
    await expect(
      assertMatchesContract({
        operationId: 'convertLogoImage',
        status: 200,
        body: { success: true, data: { dataUrl: 123 } },
      })
    ).rejects.toThrow(/does not match the contract/);
  });

  it('rejects an unknown operationId', async () => {
    await expect(
      assertMatchesContract({ operationId: 'nope', status: 200, body: {} })
    ).rejects.toThrow(/no operationId/);
  });
});
