/**
 * Coalesce a high-rate event handler (pointermove) to at most one call per
 * animation frame, always with the latest event. A drag dispatches into the
 * viewer context, which re-renders every consumer and the 3D actors — doing
 * that more often than the screen refreshes is wasted work.
 *
 * `flush()` runs a pending call at once (on pointer-up / effect cleanup, so
 * the final position is never lost); `cancel()` drops it.
 */
export interface RafThrottled<A extends unknown[]> {
  (...args: A): void;
  flush: () => void;
  cancel: () => void;
}

export function rafThrottle<A extends unknown[]>(fn: (...args: A) => void): RafThrottled<A> {
  let frame: number | null = null;
  let pending: A | null = null;
  const run = () => {
    frame = null;
    const args = pending;
    pending = null;
    if (args) fn(...args);
  };
  const throttled = ((...args: A) => {
    pending = args;
    if (frame === null) frame = requestAnimationFrame(run);
  }) as RafThrottled<A>;
  throttled.flush = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    run();
  };
  throttled.cancel = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    pending = null;
  };
  return throttled;
}
