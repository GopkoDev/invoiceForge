'use client';

import { ArrowUpIcon, SparklesIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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
const noscriptCss = `.${styles.root} .${styles.bubble},.${styles.root} .${styles.avatar}{opacity:1}.${styles.root} .${styles.cardWrap}{opacity:1;transform:none}.${styles.root} .${styles.empty}{opacity:0}`;

export function LandingDemo({ sample }: { sample: LandingDemoSample }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [armed, setArmed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [late, setLate] = useState(false);
  const [reduced, setReduced] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLParagraphElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasPlayed = useRef(false);
  const [replayed, setReplayed] = useState(false);

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

  const replay = () => {
    if (phase !== 'done' && phase !== 'still') return;
    setReplayed(true);
    setLate(false);
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
        <div className={styles.window} aria-hidden="true">
          <div className={styles.titlebar}>
            <span className={styles.lights}>
              <span />
              <span />
              <span />
            </span>
            <span className={styles.title}>
              <SparklesIcon className="size-3.5" />
              {sample.windowTitle}
            </span>
            <Badge variant="outline">{sample.exampleLabel}</Badge>
          </div>
          <div className={styles.body}>
            <div className={styles.empty}>
              <span className={styles.emptyMark}>
                <SparklesIcon className="size-5" />
              </span>
              <span>{sample.emptyPrompt}</span>
            </div>
            <div className={styles.bubbleRow}>
              <p ref={bubbleRef} className={styles.bubble}>{sample.sentence}</p>
            </div>
            <div className={styles.reply}>
              <span className={styles.avatar}>
                <SparklesIcon className="size-3.5" />
              </span>
              <div className={styles.stage}>
                <div className={styles.thinking}>
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                </div>
                <div className={styles.cardWrap}>
                  <p className={styles.replyText}>
                    <span className={styles.replyName}>{sample.assistantName}</span>
                    {sample.replyText}
                  </p>
                  <DemoDraftCard
                    customer={sample.customer}
                    lines={sample.lines}
                    total={sample.total}
                    currency={sample.currency}
                    exampleLabel={sample.exampleLabel}
                    cardTitle={sample.cardTitle}
                    customerLabel={sample.customerLabel}
                    totalLabel={sample.totalLabel}
                    createLabel={sample.createLabel}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className={styles.composer}>
            <div className={styles.field}>
              <span className={styles.placeholder}>{sample.composerPlaceholder}</span>
              {/* The typed sentence is CSS-generated text, so the sentence stays one text node (the bubble). */}
              <span className={styles.typed} data-text={sample.sentence} />
            </div>
            <span className={styles.send}>
              <ArrowUpIcon className="size-4" />
            </span>
          </div>
        </div>
        {/* Real links sit outside the aria-hidden layer, overlaid on the window and the Create visual, in every phase. */}
        <div className={styles.links}>
          <Link href={authRoutes.signIn} className={styles.cardLink}>
            <span className="sr-only">{sample.cardLinkLabel}</span>
          </Link>
          <Link href={authRoutes.signIn} className={styles.createLink}>
            <span className="sr-only">{sample.createLabel}</span>
          </Link>
        </div>
      </div>
      <p className="sr-only">{sample.srSummary}</p>
      <div className={styles.replayRow}>
        {(replayed || phase === 'done' || (phase === 'still' && !reduced)) && (
          <button
            type="button"
            className={`${buttonVariants({ variant: 'outline', size: 'sm' })} aria-disabled:cursor-default aria-disabled:opacity-50`}
            aria-disabled={phase === 'done' || phase === 'still' ? undefined : 'true'}
            onClick={replay}
          >
            {sample.replayLabel}
          </button>
        )}
      </div>
    </div>
  );
}
