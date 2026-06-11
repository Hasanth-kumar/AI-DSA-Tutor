import { useEffect, useState } from "react";
import { API_BASE } from "../api/client.js";
import { invalidateCache } from "../api/cache.js";

export const DATA_CHANGED_EVENT = "dsa:data-changed";

/**
 * SSE push from the backend (5.4). On every change event the fetch cache is
 * cleared and a window event fires so usePolling consumers refresh instantly.
 * When the stream drops, polling remains as the fallback and the EventSource
 * auto-reconnects.
 */
export function useLiveEvents(): { connected: boolean } {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      source = new EventSource(`${API_BASE}/api/events`);

      source.addEventListener("connected", () => setConnected(true));
      source.addEventListener("change", () => {
        invalidateCache();
        window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
      });
      source.onerror = () => {
        setConnected(false);
        source?.close();
        // EventSource reconnects on its own for transient errors, but a
        // closed stream needs a manual retry.
        retryTimer = setTimeout(connect, 10_000);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, []);

  return { connected };
}
