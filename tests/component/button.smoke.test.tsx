// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button';

describe('Button (component smoke)', () => {
  it('renders and responds to a click', async () => {
    const user = userEvent.setup();
    let clicked = 0;

    render(<Button onClick={() => (clicked += 1)}>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(clicked).toBe(1);
  });
});
