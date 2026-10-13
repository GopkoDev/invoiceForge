// @vitest-environment jsdom
// T34 (ai-chat-v2; ADR-0010; AC-18, AC-31; screens.md «Composer»): the ported PromptInput and Suggestion elements.
// Enter submits, Shift+Enter adds a line, IME composition never submits, the submit reflects the chat status (disabled
// with a Loader while a reply is in flight), its name is overridable, and a Suggestion only reports its text.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputStatus,
} from '@/components/ai-elements/prompt-input';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';

function Box({
  onSubmit,
  status = 'ready',
  submitLabel,
  disabled,
}: {
  onSubmit: (text: string) => void;
  status?: PromptInputStatus;
  submitLabel?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  return (
    <PromptInput onSubmit={onSubmit}>
      <PromptInputBody>
        <PromptInputTextarea
          aria-label="Message"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <span>29 of 30 messages left today</span>
        </PromptInputTools>
        <PromptInputSubmit
          status={status}
          disabled={disabled}
          aria-label={submitLabel}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}

describe('PromptInput', () => {
  it('Enter submits the text; Shift+Enter inserts a newline', async () => {
    const onSubmit = vi.fn();
    render(<Box onSubmit={onSubmit} />);
    const box = screen.getByRole('textbox', { name: 'Message' });
    await userEvent.type(box, 'first{Shift>}{Enter}{/Shift}second');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(box).toHaveValue('first\nsecond');
    await userEvent.type(box, '{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('first\nsecond');
  });

  it('Enter during IME composition does not submit', () => {
    const onSubmit = vi.fn();
    render(<Box onSubmit={onSubmit} />);
    const box = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(box, { target: { value: 'にほん' } });
    fireEvent.compositionStart(box);
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    fireEvent.compositionEnd(box);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('the submit is a round "Send" button with an arrow while ready, and pressing it submits', async () => {
    const onSubmit = vi.fn();
    render(<Box onSubmit={onSubmit} />);
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Message' }),
      'hi'
    );
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('type', 'submit');
    expect(send).toHaveClass('rounded-full', 'size-8');
    expect(send).toBeEnabled();
    await userEvent.click(send);
    expect(onSubmit).toHaveBeenCalledWith('hi');
  });

  it.each(['submitted', 'streaming'] as const)(
    'while %s the submit is disabled and shows a Loader; Enter sends nothing',
    async (status) => {
      const onSubmit = vi.fn();
      render(<Box onSubmit={onSubmit} status={status} />);
      const send = screen.getByRole('button', { name: 'Send' });
      expect(send).toBeDisabled();
      expect(send.querySelector('[data-slot="loader"]')).not.toBeNull();
      const box = screen.getByRole('textbox', { name: 'Message' });
      await userEvent.type(box, 'x{Enter}');
      expect(onSubmit).not.toHaveBeenCalled();
    }
  );

  it('the submit name is overridable ("Send to AI" for the dashboard) and "error" shows the arrow again', () => {
    render(<Box onSubmit={vi.fn()} status="error" submitLabel="Send to AI" />);
    const send = screen.getByRole('button', { name: 'Send to AI' });
    expect(send).toBeEnabled();
    expect(send.querySelector('[data-slot="loader"]')).toBeNull();
  });

  it('is a rounded card form holding the textarea and the footer', () => {
    const { container } = render(<Box onSubmit={vi.fn()} />);
    const form = container.querySelector('form[data-slot="prompt-input"]');
    expect(form).not.toBeNull();
    const card = form!.querySelector('[data-slot="prompt-input-card"]')!;
    expect(card).toHaveClass('rounded-2xl', 'border');
    expect(card).toContainElement(
      screen.getByRole('textbox', { name: 'Message' })
    );
    expect(card).toHaveTextContent('29 of 30 messages left today');
  });
});

describe('Suggestion', () => {
  it('reports its text on click and submits nothing', async () => {
    const onPick = vi.fn();
    const onSubmit = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <Suggestions>
          <Suggestion
            suggestion="Who owes me money right now?"
            onClick={onPick}
          />
        </Suggestions>
      </form>
    );
    const chip = screen.getByRole('button', {
      name: 'Who owes me money right now?',
    });
    expect(chip).toHaveClass('rounded-full');
    await userEvent.click(chip);
    expect(onPick).toHaveBeenCalledWith('Who owes me money right now?');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Suggestions is a wrapping row', () => {
    const { container } = render(
      <Suggestions>
        <Suggestion suggestion="a" />
      </Suggestions>
    );
    expect(container.firstElementChild).toHaveClass('flex-wrap');
  });
});
