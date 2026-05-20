/** Recursively serialize Dates for JSON API responses. */
export function serializeForJson<T>(value: T): T {
  if (value instanceof Date) {
    return value.toISOString() as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeForJson(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = serializeForJson(val);
    }
    return out as T;
  }
  return value;
}

export function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
