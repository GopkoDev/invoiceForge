// @vitest-environment jsdom
// T33 (ai-chat-v2; ADR-0010; AC-16, AC-33; screens.md «Presentation revision»): the ported Conversation, Message and
// Loader elements. Conversation is driven by useFollowLatest (48 px), never use-stick-to-bottom; MessageResponse shows
// plain text only (ai-assistant AC-07); Message `from` sets data-role and alignment; Loader is a static status under
// reduced motion.
//
// jsdom has no layout: the conversation's scroll area gets a 400 px view whose content height is set per test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RotateCcwIcon } from 'lucide-react';

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageAvatar,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import { Loader } from '@/components/ai-elements/loader';

const VIEW = 400;
let content = 1000;
const scrollTops = new WeakMap<Element, number>();
const isScroll = (el: Element) =>
  (el as HTMLElement).dataset?.slot === 'conversation-content';
const maxTop = () => Math.max(0, content - VIEW);

const originals = {
  scrollHeight: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollHeight'
  ),
  clientHeight: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientHeight'
  ),
  scrollTop: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollTop'
  ),
  scrollTo: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo'),
};

beforeEach(() => {
  content = 1000;
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isScroll(this) ? content : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isScroll(this) ? VIEW : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return scrollTops.get(this) ?? 0;
    },
    set(this: HTMLElement, value: number) {
      scrollTops.set(
        this,
        Math.min(Math.max(0, value), isScroll(this) ? maxTop() : 0)
      );
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, options: ScrollToOptions) {
      this.scrollTop = options.top ?? 0;
    },
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }))
  );
});

afterEach(() => {
  for (const [key, descriptor] of Object.entries(originals)) {
    if (descriptor)
      Object.defineProperty(HTMLElement.prototype, key, descriptor);
    else
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
  vi.unstubAllGlobals();
});

function Thread({ text }: { text: string }) {
  return (
    <Conversation content={text}>
      <ConversationContent>
        <p>{text}</p>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

function scrollArea(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    '[data-slot="conversation-content"]'
  );
  if (!el) throw new Error('no conversation scroll area');
  return el;
}

describe('Conversation (AC-16: follow within 48 px, jump control beyond it)', () => {
  it('opens at the end and follows new content while the end is within 48 px of view', () => {
    const { container, rerender } = render(<Thread text="one" />);
    const area = scrollArea(container);
    expect(area.scrollTop).toBe(600);

    // 48 px out of view still counts as the bottom.
    act(() => {
      area.scrollTop = 552;
      fireEvent.scroll(area);
    });
    content = 1200;
    rerender(<Thread text="one two" />);
    expect(area.scrollTop).toBe(800);
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).toBeNull();
  });

  it('stays put 49 px up, shows the scroll button, and the button jumps back and hides', async () => {
    const { container, rerender } = render(<Thread text="one" />);
    const area = scrollArea(container);
    act(() => {
      area.scrollTop = 551;
      fireEvent.scroll(area);
    });
    content = 1200;
    rerender(<Thread text="one two" />);
    expect(area.scrollTop).toBe(551);

    const jump = screen.getByRole('button', { name: 'Jump to latest' });
    await userEvent.click(jump);
    expect(area.scrollTop).toBe(800);
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).toBeNull();
  });

  it('is a full-width scroll area holding a centred max-w-3xl column, with no role="log" live region', () => {
    const { container } = render(<Thread text="one" />);
    const area = scrollArea(container);
    expect(area).toHaveClass('overflow-y-auto');
    expect(area.firstElementChild).toHaveClass('mx-auto', 'max-w-3xl');
    expect(container.querySelector('[role="log"]')).toBeNull();
  });

  it('ConversationEmptyState centres its children both ways', () => {
    render(
      <ConversationEmptyState>
        <h1>Hello</h1>
      </ConversationEmptyState>
    );
    const box = screen.getByRole('heading', { name: 'Hello' }).parentElement!;
    expect(box).toHaveClass('items-center', 'justify-center');
  });
});

describe('Message', () => {
  it('`from` sets data-role and the alignment; the user bubble is secondary and at most 80 % wide', () => {
    const { container } = render(
      <>
        <Message from="user">
          <MessageContent>
            <MessageResponse>hi</MessageResponse>
          </MessageContent>
        </Message>
        <Message from="assistant">
          <MessageAvatar />
          <MessageContent>
            <MessageResponse>hello</MessageResponse>
          </MessageContent>
        </Message>
      </>
    );
    const user = container.querySelector('[data-role="user"]')!;
    const assistant = container.querySelector('[data-role="assistant"]')!;
    expect(user).toHaveClass('justify-end');
    expect(assistant).not.toHaveClass('justify-end');
    const bubble = user.querySelector('[data-slot="message-content"]')!;
    expect(bubble).toHaveClass('bg-secondary', 'max-w-[80%]', 'rounded-2xl');
    expect(bubble).not.toHaveClass('bg-primary');
    expect(
      assistant.querySelector('[data-slot="message-avatar"]')
    ).not.toBeNull();
    expect(
      assistant.querySelector('[data-slot="message-content"]')
    ).not.toHaveClass('bg-secondary');
  });

  it('MessageResponse shows Markdown, HTML and a URL literally, with no anchor (ai-assistant AC-07)', () => {
    const raw = '**bold** <b>x</b> [x](https://evil.example)\nsecond line';
    const { container } = render(
      <Message from="assistant">
        <MessageContent>
          <MessageResponse>{raw}</MessageResponse>
        </MessageContent>
      </Message>
    );
    const response = container.querySelector('[data-slot="message-response"]')!;
    expect(response.textContent).toBe(raw);
    expect(response).toHaveClass('whitespace-pre-wrap');
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('strong')).toBeNull();
  });

  it('MessageAction has an accessible name and a visible label, and reports the press', async () => {
    const onClick = vi.fn();
    render(
      <MessageActions>
        <MessageAction onClick={onClick}>
          <RotateCcwIcon aria-hidden />
          Try again
        </MessageAction>
        <MessageAction label="Copy" tooltip="Copy">
          <RotateCcwIcon aria-hidden />
        </MessageAction>
      </MessageActions>
    );
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry).toBeVisible();
    await userEvent.click(retry);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });
});

describe('Loader', () => {
  it('is a status with its label, and its spinner does not animate under reduced motion', () => {
    const { container } = render(
      <Loader label="Thinking…" announce="Assistant is replying…" />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Assistant is replying…'
    );
    expect(screen.getByText('Thinking…')).toBeVisible();
    const spinner = container.querySelector('svg')!;
    expect(spinner).toHaveClass('motion-reduce:animate-none');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
  });
});
