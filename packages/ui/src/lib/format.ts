/**
 * Human formatting (SPEC C9): exact and readable. "512 MB", "42s", "3 min ago".
 * Memory and disk use binary units labelled with the common MB / GB names,
 * matching how Docker limits and disk sizes are shown to users.
 */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export interface FormatBytesOptions {
  /** Digits after the decimal point for values of at least 1 KB. Default 1; trailing zeros dropped. */
  decimals?: number;
}

/** "512 MB", "1.2 GB", "0 B". */
export function formatBytes(bytes: number, options: FormatBytesOptions = {}): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }
  const decimals = options.decimals ?? 1;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const unit = BYTE_UNITS[unitIndex] ?? "B";
  const rounded = unitIndex === 0 ? String(Math.round(value)) : trimZeros(value.toFixed(decimals));
  return `${rounded} ${unit}`;
}

/** Formats megabytes the way memory limits are shown: "512 MB", "1 GB", "1.5 GB". */
export function formatMegabytes(mb: number): string {
  if (!Number.isFinite(mb) || mb < 0) {
    return "0 MB";
  }
  if (mb >= 1024) {
    return `${trimZeros((mb / 1024).toFixed(1))} GB`;
  }
  return `${String(Math.round(mb))} MB`;
}

/** "42s", "1m 12s", "2h 5m", "3d 4h", "0s". Sub-second values round up to 1s. */
export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "0s";
  }
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) {
    return hours > 0 ? `${String(days)}d ${String(hours)}h` : `${String(days)}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${String(hours)}h ${String(minutes)}m` : `${String(hours)}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${String(minutes)}m ${String(seconds)}s` : `${String(minutes)}m`;
  }
  return `${String(seconds)}s`;
}

/** "just now", "3 min ago", "2 h ago", "1 d ago", "in 6 d". */
export function formatRelativeTime(date: Date | number, now: Date | number = Date.now()): string {
  const target = typeof date === "number" ? date : date.getTime();
  const reference = typeof now === "number" ? now : now.getTime();
  const deltaSeconds = Math.round((reference - target) / 1000);
  const past = deltaSeconds >= 0;
  const abs = Math.abs(deltaSeconds);
  if (abs < 45) {
    return past ? "just now" : "in a moment";
  }
  let text: string;
  if (abs < 3600) {
    text = `${String(Math.max(1, Math.round(abs / 60)))} min`;
  } else if (abs < 86_400) {
    text = `${String(Math.round(abs / 3600))} h`;
  } else if (abs < 30 * 86_400) {
    text = `${String(Math.round(abs / 86_400))} d`;
  } else if (abs < 365 * 86_400) {
    text = `${String(Math.round(abs / (30 * 86_400)))} mo`;
  } else {
    text = `${String(Math.round(abs / (365 * 86_400)))} y`;
  }
  return past ? `${text} ago` : `in ${text}`;
}

/** "34 %", "99.5 %". */
export function formatPercent(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) {
    return "0 %";
  }
  return `${trimZeros(value.toFixed(decimals))} %`;
}

/** "1,234" with a non-breaking group separator. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function trimZeros(fixed: string): string {
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}
