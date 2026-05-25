/** Coalesce rapid callbacks to one invocation per animation frame. */
export function createRafCoalescer<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  let rafId = 0;
  let pending: A | null = null;
  return (...args: A) => {
    pending = args;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      const argsToRun = pending;
      pending = null;
      if (argsToRun) fn(...argsToRun);
    });
  };
}
