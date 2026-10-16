'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { authRoutes } from '@/config/routes.config';
import type { LandingDemoSample } from '@/constants/public-pages-content';
import { DemoDraftCard } from './demo-draft-card';
import styles from './landing-demo.module.css';

type Phase = 'idle' | 'typing' | 'thinking' | 'card' | 'done' | 'still';

/** Delay (ms) before each phase begins, counted from the start; total stays well under 8 s. */
const PHASE_STARTS: ReadonlyArray<readonly [Phase, number]> = [
  ['thinking', 1800],
  ['card', 3200],
  ['done', 4600],
];
const REPLAY_RESET_MS = 300;
/** Finished still for visitors without scripts; mirrors the `still` rules in the CSS module. */
const noscriptCss = `.${styles.root} .${styles.bubble}{opacity:1;clip-path:inset(0)}.${styles.root} .${styles.cardWrap}{opacity:1;transform:none}`;

export function LandingDemo({ sample }: { sample: LandingDemoSample }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [armed, setArmed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [late, setLate] = useState(false);
  const [reduced, setReduced] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLParagraphElement>(null);
  const replayRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasPlayed = useRef(false);
  const replayed = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const play = useCallback(() => {
    clearTimers();
    setPhase('typing');
    for (const [next, at] of PHASE_STARTS) {
      timers.current.push(setTimeout(() => setPhase(next), at));
    }
  }, [clearTimers]);

  /* eslint-disable react-hooks/set-state-in-effect -- mount-time client detection (armed, reduced motion) must follow hydration so the server HTML stays the start frame */
  useEffect(() => {
    // Read the CSS load reveal before arming, while its rules still apply: a visible bubble means the still already showed.
    const bubble = bubbleRef.current;
    const cssRevealed = bubble !== null && parseFloat(window.getComputedStyle(bubble).opacity) >= 1;
    // Armed: the player has taken over, so the CSS load reveal stands down.
    setArmed(true);
    if (cssRevealed) setLate(true);
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setReduced(true);
      setPhase('still');
      return;
    }
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      setPhase('still');
      return;
    }
    let wasRevealed = cssRevealed;
    const observer = new IntersectionObserver(
      (entries) => {
        if (hasPlayed.current) return;
        const onScreen = entries.some(
          (e) => e.isIntersecting && e.intersectionRatio >= 0.5
        );
        const wasLate = wasRevealed;
        wasRevealed = false;
        if (!onScreen) return;
        setVisible(true);
        // Test-only hook (Playwright addInitScript); never set in production.
        if ((globalThis as { __LANDING_DEMO_HOLD__?: boolean }).__LANDING_DEMO_HOLD__ === true) return;
        hasPlayed.current = true;
        observer.disconnect();
        if (wasLate) setPhase('still');
        else play();
      },
      { threshold: 0.5 }
    );
    observer.observe(root);
    return () => {
      observer.disconnect();
      clearTimers();
    };
  }, [play, clearTimers]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // The Replay button unmounts while playing, so hand focus back when it returns after a replay.
  useEffect(() => {
    if (phase === 'done' && replayed.current) replayRef.current?.focus();
  }, [phase]);

  const replay = () => {
    replayed.current = true;
    clearTimers();
    setPhase('idle');
    timers.current.push(setTimeout(play, REPLAY_RESET_MS));
  };

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-armed={armed ? '' : undefined}
      data-visible={visible ? '' : undefined}
      data-late={late ? '' : undefined}
      data-phase={phase}
    >
      <noscript>
        <style>{noscriptCss}</style>
      </noscript>
      <div className={styles.frame}>
        <div className={styles.visual} aria-hidden="true">
          <div className={styles.bubbleRow}>
            <p ref={bubbleRef} className={styles.bubble}>{sample.sentence}</p>
          </div>
          <div className={styles.stage}>
            <div className={styles.thinking}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
            <div className={styles.cardWrap}>
              <DemoDraftCard
                customer={sample.customer}
                lines={sample.lines}
                total={sample.total}
                currency={sample.currency}
                exampleLabel={sample.exampleLabel}
                createLabel={sample.createLabel}
              />
            </div>
          </div>
          <div className={styles.input} />
        </div>
        {/* Real links sit outside the aria-hidden layer, overlaid on the card area, in every phase. */}
        <div className={styles.links}>
          <Link href={authRoutes.signIn} className={styles.cardLink}>
            <span className="sr-only">{sample.customer}</span>
          </Link>
          <Link href={authRoutes.signIn} className={styles.createLink}>
            <span className="sr-only">{sample.createLabel}</span>
          </Link>
        </div>
      </div>
      <p className="sr-only">{sample.srSummary}</p>
      <div className={styles.replayRow}>
        {(phase === 'done' || (phase === 'still' && !reduced)) && (
          <button
            ref={replayRef}
            type="button"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
            onClick={replay}
          >
            {sample.replayLabel}
          </button>
        )}
      </div>
    </div>
  );
}
