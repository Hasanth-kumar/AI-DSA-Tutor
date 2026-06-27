type CacheEntry<T> = { data: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.data as T;
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const promise = fetcher()
    .then((data) => {
      store.set(key, { data, expiresAt: Date.now() + ttlMs });
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

export function invalidateCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    store.clear();
    inflight.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(keyPrefix)) store.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(keyPrefix)) inflight.delete(key);
  }
}

/** Invalidate only the fetch keys affected by a backend SSE change event. */
export function invalidateForDataChange(type: string): void {
  switch (type) {
    case "session":
      invalidateCache("sessions:");
      invalidateCache("activity:");
      invalidateCache("dashboard");
      invalidateCache("plan");
      break;
    case "topic":
      invalidateCache("topics");
      invalidateCache("plan");
      invalidateCache("dashboard");
      invalidateCache("curriculum");
      break;
    case "problem":
      invalidateCache("problems");
      invalidateCache("topics");
      invalidateCache("plan");
      invalidateCache("dashboard");
      break;
    case "attempt":
      invalidateCache("topics");
      invalidateCache("dashboard");
      invalidateCache("activity:");
      break;
    case "sync":
      invalidateCache("health:");
      break;
    case "note":
      invalidateCache("topics");
      break;
    default:
      invalidateCache();
  }
}
