'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/** spec §1 "Following new text": the end no more than 48 px out of view counts as at the bottom. */
export const FOLLOW_THRESHOLD_PX = 48;

/** True while the end of a scroll area is no more than `threshold` px out of view. */
export function isAtBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold = FOLLOW_THRESHOLD_PX
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/** Puts the end of a scroll area in view at once. */
function scrollToEnd(node: HTMLElement): void {
  node.scrollTop = node.scrollHeight;
}

/** How long a smooth jump may take before the Freelancer's own scrolling counts again. */
const JUMP_SETTLE_MS = 1000;

/**
 * ai-chat-v2 T21 (AC-16; screens.md §SCR-03 "Following new text"): keeps the newest text in view while the
 * Freelancer is at the bottom of the scroll area, and never moves the view once they have scrolled further up.
 * `content` changes (a new message, a streamed delta) trigger the follow; `showJump` asks for the "Jump to latest"
 * control. Attach `scrollRef` to the scroll area (a callback ref, so a scroll area mounted later is picked up).
 */
export function useFollowLatest(content: unknown) {
  const [el, scrollRef] = useState<HTMLElement | null>(null);
  const following = useRef(true);
  const jumpingUntil = useRef(0);
  const [showJump, setShowJump] = useState(false);

  // The Freelancer's own scrolling decides whether new text is followed.
  useEffect(() => {
    if (!el) return;
    const onScroll = () => {
      const atBottom = isAtBottom(
        el.scrollHeight,
        el.scrollTop,
        el.clientHeight
      );
      // A smooth jump passes through positions further up; they are not the Freelancer scrolling away.
      if (!atBottom && Date.now() < jumpingUntil.current) return;
      jumpingUntil.current = 0;
      following.current = atBottom;
      setShowJump(!atBottom);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [el]);

  // Content can also grow with no new message: a Draft card replacing its skeleton after the reply, offer labels
  // replacing theirs, a card refreshed from the server (review 2026-10-13 R1-U4). While following, keep the end in
  // view; further up nothing moves (the jump control is already showing).
  useEffect(() => {
    if (!el) return;
    const follow = () => {
      if (following.current) scrollToEnd(el);
    };
    // A narrower or wider pane (the preview column opening or closing) reflows the same content: that is not new
    // content, so the view stays where it is and the Freelancer's messages stay beside the preview (AC-20).
    let width = el.clientWidth;
    const onResize = () => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        return;
      }
      follow();
    };
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    const observeChildren = () => {
      for (const child of Array.from(el.children)) resize?.observe(child);
    };
    observeChildren();
    const mutation = new MutationObserver(() => {
      observeChildren();
      follow();
    });
    mutation.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      mutation.disconnect();
      resize?.disconnect();
    };
  }, [el]);

  // Follow new content before paint while at the bottom (on open too: a reopened Conversation shows its end).
  useLayoutEffect(() => {
    if (el && following.current) scrollToEnd(el);
  }, [el, content]);

  /** Scrolls to the end and resumes following: the jump control (smooth unless reduced motion), and every send. */
  const jumpToLatest = useCallback(
    (instant = false) => {
      following.current = true;
      setShowJump(false);
      if (!el) return;
      if (
        !instant &&
        !prefersReducedMotion() &&
        typeof el.scrollTo === 'function'
      ) {
        jumpingUntil.current = Date.now() + JUMP_SETTLE_MS;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } else {
        scrollToEnd(el);
      }
    },
    [el]
  );

  return { scrollRef, showJump, jumpToLatest };
}
