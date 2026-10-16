// @vitest-environment jsdom
// T03 (landing-update; AC-02, AC-03, AC-05) - DemoDraftCard: presentational replica of the chat draft card.
// Seam: components/landing/landing-demo/demo-draft-card.tsx -> export function DemoDraftCard(props: LandingDemoSample)
//   (props are the sample fields spread: <DemoDraftCard {...landingContent.demo} />).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { landingContent } from '@/constants/public-pages-content';
import { DemoDraftCard } from '@/components/landing/landing-demo/demo-draft-card';

const demo = landingContent.demo;

describe('DemoDraftCard', () => {
  it('AC-02: renders Customer, the line, total with currency and the Example label from fixed props', () => {
    const { container } = render(<DemoDraftCard {...demo} />);
    const text = container.textContent ?? '';
    expect(text).toContain(demo.customer);
    for (const line of demo.lines) {
      expect(text).toContain(line.description);
      expect(text).toContain(line.quantityLabel);
      expect(text).toContain(line.amount);
    }
    expect(text).toContain(demo.total);
    expect(text).toContain(demo.currency);
    expect(screen.getByText(demo.exampleLabel)).toBeTruthy();
  });

  it('AC-02/AC-05: shows Create unpressed (no disabled, pressed, busy or created state)', () => {
    const { container } = render(<DemoDraftCard {...demo} />);
    const create = screen.getByText(demo.createLabel);
    expect(create).toBeTruthy();
    expect(create.closest('[disabled], [aria-pressed], [aria-busy], [data-loading]')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/created|creating|issued|sent/i);
  });

  it('AC-03: contains no focusable element (links and buttons are the player overlay)', () => {
    const { container } = render(<DemoDraftCard {...demo} />);
    const focusable = container.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]',
    );
    expect(focusable.length).toBe(0);
  });

  it('AC-03: does not import from components/ai (source check)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'components/landing/landing-demo/demo-draft-card.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/from\s+['"][^'"]*components\/ai[^'"]*['"]/);
    expect(src).not.toMatch(/from\s+['"][^'"]*\/actions[^'"]*['"]/);
  });
});
