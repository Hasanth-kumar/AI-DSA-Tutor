import { useCallback, useEffect, useRef, useState } from "react";

export interface UsePollingOptions {
  enabled?: boolean;
  pauseWhenHidden?: boolean;
  initialLoading?: boolean;
}

function isSameData<T>(prev: T | null, next: T): boolean {
  if (prev === next) return true;
  if (prev == null) return false;
  try {
    return JSON.stringify(prev) === JSON.stringify(next);
  } catch {
    return false;
  }
}

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  options: UsePollingOptions = {},
) {
  const { enabled = true, pauseWhenHidden = true, initialLoading = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialLoading);
  const [settled, setSettled] = useState(false);
  const firstLoad = useRef(true);
  const dataRef = useRef<T | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await fetcher();
      if (!isSameData(dataRef.current, result)) {
        dataRef.current = result;
        setData(result);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setSettled(true);
      if (firstLoad.current) {
        firstLoad.current = false;
        setLoading(false);
      }
    }
  }, [fetcher]);

  useEffect(() => {
    if (!enabled) return;

    void refresh();

    const tick = () => {
      if (pauseWhenHidden && document.visibilityState === "hidden") return;
      void refresh();
    };

    const id = setInterval(tick, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    if (pauseWhenHidden) {
      document.addEventListener("visibilitychange", onVisibility);
    }

    // SSE push (5.4): refresh immediately when the backend signals a change.
    const onDataChanged = () => void refresh();
    window.addEventListener("dsa:data-changed", onDataChanged);

    return () => {
      clearInterval(id);
      if (pauseWhenHidden) {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      window.removeEventListener("dsa:data-changed", onDataChanged);
    };
  }, [refresh, intervalMs, enabled, pauseWhenHidden]);

  return { data, error, loading, settled, refresh };
}
