// Injectable clock (test-plan.md §Test data: "an injected clock for the rate-limit window and
// paidAt"). Production code that needs `now()` should accept a `Clock` instead of calling
// `new Date()` / `Date.now()` directly, so tests can control time deterministically.

export interface Clock {
  now(): Date;
}

/** The real clock, for production wiring and for tests that don't care about time. */
export const systemClock: Clock = {
  now: () => new Date(),
};

export interface FixedClock extends Clock {
  /** Move the clock forward by `ms` milliseconds. */
  advance(ms: number): void;
  /** Jump the clock to an absolute instant. */
  set(date: Date): void;
}

/** A clock a test fully controls. Never advances on its own. */
export function createFixedClock(initial: Date): FixedClock {
  let current = new Date(initial.getTime());

  return {
    now: () => new Date(current.getTime()),
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
    set: (date: Date) => {
      current = new Date(date.getTime());
    },
  };
}
