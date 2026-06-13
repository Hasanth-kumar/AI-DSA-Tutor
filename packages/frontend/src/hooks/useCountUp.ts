import { useEffect, useRef, useState } from "react";

const DURATION_MS = 400;

/**
 * Animate a number from its previously displayed value to a new target over
 * ~400ms (eased). The first render shows the value directly — only later
 * changes (e.g. a data refresh) animate. Respects prefers-reduced-motion.
 */
export function useCountUp(value: number, decimals = 0): number {
  const [display, setDisplay] = useState(value);
  // Track the latest rendered value so an interrupted run resumes from where
  // it left off rather than snapping back to the old start.
  const displayRef = useRef(value);
  displayRef.current = display;
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const from = displayRef.current;
    const to = value;
    if (reduce || Math.abs(to - from) < 1e-9) {
      setDisplay(to);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  const factor = Math.pow(10, decimals);
  return Math.round(display * factor) / factor;
}
