// T21 (ai-chat-v2; AC-16, spec §1 "Following new text"): the end of the messages no more than 48 px out of view
// counts as at the bottom; further up the Freelancer has scrolled up.
import { describe, expect, it } from 'vitest';

import {
  FOLLOW_THRESHOLD_PX,
  isAtBottom,
} from '@/components/ai/use-follow-latest';

describe('isAtBottom', () => {
  it('uses a 48 px threshold', () => {
    expect(FOLLOW_THRESHOLD_PX).toBe(48);
  });

  it('is true at the very end', () => {
    expect(isAtBottom(1000, 600, 400)).toBe(true);
  });

  it('is true while the end is exactly 48 px out of view', () => {
    expect(isAtBottom(1000, 552, 400)).toBe(true);
  });

  it('is false once the end is 49 px out of view', () => {
    expect(isAtBottom(1000, 551, 400)).toBe(false);
  });

  it('is true when the content is shorter than the view', () => {
    expect(isAtBottom(300, 0, 400)).toBe(true);
  });

  it('honours a custom threshold', () => {
    expect(isAtBottom(1000, 590, 400, 10)).toBe(true);
    expect(isAtBottom(1000, 589, 400, 10)).toBe(false);
  });
});
