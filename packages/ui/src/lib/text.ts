/**
 * Shortens an identifier or hash from the middle so both ends stay readable:
 * `truncateMiddle("dep_01j8x9k2d3m4n5p6q7r8s9t0v1", 8, 6)` → `dep_01j8…s9t0v1`.
 */
export function truncateMiddle(value: string, head: number, tail: number): string {
  if (head < 0 || tail < 0) {
    throw new RangeError("head and tail must be non-negative");
  }
  const chars = Array.from(value);
  if (chars.length <= head + tail + 1) {
    return value;
  }
  return `${chars.slice(0, head).join("")}…${chars.slice(chars.length - tail).join("")}`;
}

/** Shortens from the end: `truncateEnd("feat: checkout redesign", 12)` → `feat: check…`. */
export function truncateEnd(value: string, max: number): string {
  const chars = Array.from(value);
  if (chars.length <= max) {
    return value;
  }
  return `${chars.slice(0, Math.max(0, max - 1)).join("")}…`;
}

/** Turns "api" / "Web App" into "A" / "WA" for avatar tiles. */
export function initials(name: string, max = 2): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  return words
    .slice(0, max)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("");
}
