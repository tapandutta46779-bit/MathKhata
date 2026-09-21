import { useEffect, type DependencyList } from 'react';

export function createRenderBudget() {
  let lastYield = performance.now();
  return {
    exhausted: () => performance.now() - lastYield > 12,
    yield: () => new Promise<void>((resolve) => setTimeout(() => { lastYield = performance.now(); resolve(); }, 0)),
  };
}

// Coalesce input events into one draw per browser frame, and cancel obsolete
// async work before another view starts drawing into the same canvas.
export function useCanvasDrawEffect(effect: () => void | (() => void), dependencies: DependencyList) {
  useEffect(() => {
    let cleanup: void | (() => void);
    const frame = requestAnimationFrame(() => { cleanup = effect(); });
    return () => { cancelAnimationFrame(frame); cleanup?.(); };
  }, dependencies);
}
