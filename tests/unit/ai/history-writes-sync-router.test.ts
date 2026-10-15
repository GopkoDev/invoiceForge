// @vitest-environment jsdom
// ai-chat-v2 T31 finding (ADR-0005; AC-20, AC-22): the App Router patches history.pushState / replaceState so that
// usePathname and useSearchParams follow a URL written outside it, but it skips that sync for a state object that
// already carries its own marker (`__NA`). Copying `window.history.state` (which has the marker) into a write made
// the router miss `?preview=` (the panel never opened) and `/ai/{id}`, and a later router update wrote its stale
// address back (`/ai?start=draft`). Every write from the AI section must hand the router a state WITHOUT `__NA`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closePreview, openPreview } from '@/components/ai/preview-address';
import { replaceAddress } from '@/components/ai/preview-address';

const NEXT_STATE = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: [], renderedSearch: '' } };

describe('history writes from the AI section stay visible to the App Router', () => {
  let push: ReturnType<typeof vi.spyOn>;
  let replace: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.history.replaceState(NEXT_STATE, '', '/ai/c1');
    push = vi.spyOn(window.history, 'pushState');
    replace = vi.spyOn(window.history, 'replaceState');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const stateOf = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls[0][0] as Record<string, unknown>;

  it('openPreview pushes ?preview= with a state the router syncs from (no __NA, the preview mark kept)', () => {
    openPreview('card1');
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][2]).toBe('/ai/c1?preview=card1');
    expect(stateOf(push)).not.toHaveProperty('__NA');
    expect(stateOf(push)).toMatchObject({ aiPreview: 'card1' });
  });

  it('closePreview on an address-opened preview drops the parameter with a state the router syncs from', () => {
    window.history.replaceState(NEXT_STATE, '', '/ai/c1?preview=card1');
    replace.mockClear();
    closePreview();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][2]).toBe('/ai/c1');
    expect(stateOf(replace)).not.toHaveProperty('__NA');
  });

  it('replaceAddress swaps the address in place with a state the router syncs from', () => {
    replaceAddress('/ai/cNew');
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][2]).toBe('/ai/cNew');
    expect(stateOf(replace)).not.toHaveProperty('__NA');
    expect(stateOf(replace)).not.toHaveProperty('__PRIVATE_NEXTJS_INTERNALS_TREE');
  });

  it('replaceAddress keeps a preview mark of the current entry', () => {
    window.history.replaceState({ ...NEXT_STATE, aiPreview: 'card1' }, '', '/ai/c1?preview=card1&handoff=x');
    replace.mockClear();
    replaceAddress('/ai/c1?preview=card1');
    expect(stateOf(replace)).toEqual({ aiPreview: 'card1' });
  });
});
