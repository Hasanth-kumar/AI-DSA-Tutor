/** Filename-/cache-key-safe slug for problem and topic names. */
export function slugifyProblemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
