import { API_BASE } from "../api/client.js";

/**
 * Fire a best-effort push-only flush when the tab/window is closing.
 *
 * `navigator.sendBeacon` survives unload where `fetch` is often cancelled, so
 * it's the right tool for "user closed the browser tab even though the backend
 * is still up". This is only an *extra* trigger — the server-side SIGTERM flush
 * and the stop script remain the real guarantees, so failures here are silent.
 *
 * Debounced so navigating between dashboard views (which can emit `pagehide`)
 * doesn't spam the endpoint.
 */
const FLUSH_DEBOUNCE_MS = 10_000;
let lastFlushAt = 0;

function flush(): void {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return;
  }
  const now = Date.now();
  if (now - lastFlushAt < FLUSH_DEBOUNCE_MS) return;
  lastFlushAt = now;
  try {
    navigator.sendBeacon(`${API_BASE}/api/sync/flush`);
  } catch {
    // Unload path — nothing we can do, the server-side handlers cover it.
  }
}

export function registerFlushOnClose(): void {
  if (typeof window === "undefined") return;
  // `pagehide` is the reliable cross-browser close/bfcache signal; `beforeunload`
  // is the fallback for browsers that fire it but not a usable `pagehide`.
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
}
