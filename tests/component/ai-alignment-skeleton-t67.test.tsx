// @vitest-environment jsdom
// ai-chat-v2 T67 (AC-50, AC-51, AC-53; screens.md "Owner feedback revision 2026-10-13": Header line, Skeletons at
// final size, Avatar on the first line). jsdom has no layout, so these assert the declared structural contract
// (shared size tokens, skeletons built from the real component's boxes); pixel checks belong to the T68 e2e.
//
// Contract the implementer must meet:
//   - list top row (data-slot="conversation-list-top"): h-12 + border-b; search InputGroup h-8 (not h-9); the
//     "Conversation actions" button size-8. The chat header (data-slot="chat-header") keeps h-12 + border-b.
//   - app/(protected)/ai/[conversationId]/loading.tsx = the CHAT PANE only (the list lives in ai/layout.tsx, T66):
//     no 16rem workspace grid, no list rows/labels/footer; the real h-12 header classes, the real max-w-3xl px-4
//     column, assistant placeholder = items-start gap-3 row with a size-6 round avatar box and flex-1 lines, user
//     placeholder = rounded-2xl h-11 bubble, composer placeholder min-h-[7.25rem] inside max-w-3xl px-4 pb-4.
//   - app/(protected)/ai/loading.tsx = the /ai chat pane only, centred greeting + composer placeholder at the
//     composer's min-h-[7.25rem], no list skeleton.
//   - MessageAvatar sits in an h-6 box (one leading-6 line) that is a direct child of the items-start Message; the
//     reply text is leading-6; the avatar itself carries no mt-0.5 offset.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => '/ai/c1',
  useSearchParams: () => new URLSearchParams(),
  useSelectedLayoutSegment: () => 'c1',
}));

vi.mock('@/lib/actions/assistant-actions', () => ({
  createDraftFromCard: vi.fn(),
  deleteConversation: vi.fn(),
  deleteAllConversations: vi.fn(),
}));

import { ConversationList } from '@/components/ai/conversation-list';
import { ConversationHeader } from '@/components/ai/conversation-header';
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import AiLoading from '@/app/(protected)/ai/loading';
import ConversationLoading from '@/app/(protected)/ai/[conversationId]/loading';

afterEach(() => {
  cleanup();
});

const has = (el: Element | null | undefined, token: string) =>
  !!el && el.className.split(/\s+/).includes(token);

function skeletons(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-slot="skeleton"]')
  );
}

describe('AC-50: list top row and chat header share one height and border line', () => {
  it('gives the list top row h-12 + border-b, like the chat header', () => {
    const list = render(
      <ConversationList
        conversations={[
          { id: 'c1', title: 'One', lastMessageAt: '2026-10-13T09:00:00.000Z' },
        ]}
        timeZone="UTC"
        onDelete={() => {}}
      />
    );
    const top = list.container.querySelector(
      '[data-slot="conversation-list-top"]'
    );
    expect(top).not.toBeNull();
    cleanup();
    const header = render(
      <ConversationHeader title="One" onDelete={() => {}} />
    ).container.querySelector('[data-slot="chat-header"]');
    expect(header).not.toBeNull();
    for (const token of ['h-12', 'border-b']) {
      expect(has(top, token), `list top row lacks ${token}`).toBe(true);
      expect(has(header, token), `chat header lacks ${token}`).toBe(true);
    }
  });

  it('sizes the search group h-8 and the actions button size-8 inside the top row', () => {
    const { container } = render(
      <ConversationList
        conversations={[
          { id: 'c1', title: 'One', lastMessageAt: '2026-10-13T09:00:00.000Z' },
        ]}
        timeZone="UTC"
        onDelete={() => {}}
      />
    );
    const top = container.querySelector('[data-slot="conversation-list-top"]')!;
    const group = top.querySelector('[data-slot="input-group"]');
    expect(has(group, 'h-8')).toBe(true);
    expect(has(group, 'h-9')).toBe(false);
    const actions = top.querySelector('[aria-label="Conversation actions"]');
    expect(has(actions, 'size-8')).toBe(true);
  });
});

describe('AC-51: the chat-pane loading is the real chat pane, without the list', () => {
  it('draws no workspace grid and no list skeleton (the list stays from the layout)', () => {
    const { container } = render(<ConversationLoading />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toMatch(/16rem/);
    expect(root.className).not.toMatch(/grid-cols/);
    expect(container.querySelector('.border-r')).toBeNull();
    expect(skeletons(container).filter((s) => has(s, 'h-9'))).toHaveLength(0);
  });

  it('reuses the real header box (h-12 border-b px-2 md:px-4 shrink-0)', () => {
    const real = render(
      <ConversationHeader title="One" onDelete={() => {}} />
    ).container.querySelector('[data-slot="chat-header"]')!;
    cleanup();
    const { container } = render(<ConversationLoading />);
    const header = container.querySelector('.h-12.border-b');
    expect(header).not.toBeNull();
    for (const token of ['h-12', 'border-b', 'shrink-0', 'px-2', 'md:px-4']) {
      expect(real.className.split(/\s+/)).toContain(token);
      expect(has(header, token), `header placeholder lacks ${token}`).toBe(
        true
      );
    }
  });

  it('uses the real max-w-3xl px-4 column with an assistant row (items-start gap-3, size-6 avatar) and a user bubble', () => {
    const { container } = render(<ConversationLoading />);
    const column = container.querySelector('.max-w-3xl.px-4');
    expect(column).not.toBeNull();
    const avatar = skeletons(container).find(
      (s) => has(s, 'size-6') && has(s, 'rounded-full')
    );
    expect(
      avatar,
      'assistant avatar placeholder (size-6 rounded-full)'
    ).toBeDefined();
    const row = avatar!.closest('.items-start.gap-3');
    expect(row, 'avatar sits in an items-start gap-3 row').not.toBeNull();
    const bubble = skeletons(container).find(
      (s) => has(s, 'rounded-2xl') && has(s, 'h-11') && has(s, 'self-end')
    );
    expect(bubble, 'user bubble placeholder h-11 rounded-2xl').toBeDefined();
  });

  it('draws the composer placeholder at the real min height inside the real dock padding', () => {
    const { container } = render(<ConversationLoading />);
    const composer = skeletons(container).find((s) =>
      has(s, 'min-h-[7.25rem]')
    );
    expect(composer, 'composer placeholder min-h-[7.25rem]').toBeDefined();
    expect(has(composer, 'rounded-2xl')).toBe(true);
    expect(skeletons(container).some((s) => has(s, 'h-28'))).toBe(false);
    const dock = composer!.closest('.max-w-3xl');
    expect(has(dock, 'px-4')).toBe(true);
    expect(has(dock, 'pb-4')).toBe(true);
  });
});

describe('AC-51: the /ai loading is the centred start pane, without the list', () => {
  it('draws no workspace grid, no list rows, and a composer placeholder at the real min height', () => {
    const { container } = render(<AiLoading />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toMatch(/16rem/);
    expect(root.className).not.toMatch(/grid-cols/);
    expect(container.querySelector('.border-r')).toBeNull();
    const all = skeletons(container);
    expect(all.filter((s) => has(s, 'h-9'))).toHaveLength(0);
    const composer = all.find((s) => has(s, 'min-h-[7.25rem]'));
    expect(composer, 'composer placeholder min-h-[7.25rem]').toBeDefined();
    expect(all.some((s) => has(s, 'h-28'))).toBe(false);
    expect(composer!.closest('.max-w-3xl')).not.toBeNull();
  });
});

describe('AC-53: the avatar is level with the first line of the reply', () => {
  function renderReply(text: string) {
    return render(
      <Message from="assistant">
        <MessageAvatar />
        <MessageContent>
          <MessageResponse>{text}</MessageResponse>
        </MessageContent>
      </Message>
    ).container;
  }

  it.each([
    ['one line', 'Two Customers owe you money.'],
    ['several lines', 'First line.\n\nSecond paragraph.\n\n- a\n- b'],
  ])(
    'puts the avatar in an h-6 box at the top of the row (%s)',
    (_name, text) => {
      const container = renderReply(text);
      const message = container.querySelector('[data-slot="message"]')!;
      expect(has(message, 'items-start')).toBe(true);
      const avatar = container.querySelector('[data-slot="message-avatar"]')!;
      expect(has(avatar, 'mt-0.5')).toBe(false);
      let box: Element = avatar;
      while (box.parentElement && box.parentElement !== message) {
        box = box.parentElement;
      }
      // The box is the avatar itself or a wrapper that is a direct child of the Message.
      const boxes = [avatar, box].filter((el) => el.parentElement === message);
      expect(boxes.some((el) => has(el, 'h-6'))).toBe(true);
    }
  );

  it('sets the reply text to one 24 px line box (leading-6) matching the h-6 avatar box', () => {
    const container = renderReply('Two Customers owe you money.');
    const response = container.querySelector('[data-slot="message-response"]')!;
    const content = container.querySelector('[data-slot="message-content"]')!;
    expect(has(response, 'leading-6') || has(content, 'leading-6')).toBe(true);
  });

  it('keeps the first Markdown block free of a top margin', () => {
    const container = renderReply('- a\n- b');
    const response = container.querySelector('[data-slot="message-response"]')!;
    expect(response.className).toContain('[&>:first-child]:mt-0');
  });
});
