import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatCount,
  formatDuration,
  formatMegabytes,
  formatPercent,
  formatRelativeTime,
} from "./format";

describe("formatBytes", () => {
  it("formats every unit and trims zeros", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(512 * 1024 * 1024)).toBe("512 MB");
    expect(formatBytes(1.2 * 1024 ** 3)).toBe("1.2 GB");
    expect(formatBytes(5 * 1024 ** 4)).toBe("5 TB");
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("formatMegabytes", () => {
  it("shows memory limits the way the slider does", () => {
    expect(formatMegabytes(128)).toBe("128 MB");
    expect(formatMegabytes(512)).toBe("512 MB");
    expect(formatMegabytes(1024)).toBe("1 GB");
    expect(formatMegabytes(1536)).toBe("1.5 GB");
    expect(formatMegabytes(18 * 1024)).toBe("18 GB");
  });
});

describe("formatDuration", () => {
  it("picks the two largest units", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(400)).toBe("1s");
    expect(formatDuration(42_000)).toBe("42s");
    expect(formatDuration(72_000)).toBe("1m 12s");
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(2 * 3600_000 + 5 * 60_000)).toBe("2h 5m");
    expect(formatDuration(3 * 86_400_000 + 4 * 3600_000)).toBe("3d 4h");
    expect(formatDuration(Number.NaN)).toBe("0s");
  });
});

describe("formatRelativeTime", () => {
  const now = Date.UTC(2026, 8, 26, 12, 0, 0);

  it("uses the C9 wording", () => {
    expect(formatRelativeTime(now - 10_000, now)).toBe("just now");
    expect(formatRelativeTime(now - 3 * 60_000, now)).toBe("3 min ago");
    expect(formatRelativeTime(now - 2 * 3600_000, now)).toBe("2 h ago");
    expect(formatRelativeTime(now - 86_400_000, now)).toBe("1 d ago");
    expect(formatRelativeTime(now - 45 * 86_400_000, now)).toBe("2 mo ago");
    expect(formatRelativeTime(now - 400 * 86_400_000, now)).toBe("1 y ago");
    expect(formatRelativeTime(now + 6 * 86_400_000, now)).toBe("in 6 d");
    expect(formatRelativeTime(new Date(now - 60_000), new Date(now))).toBe("1 min ago");
  });
});

describe("formatPercent and formatCount", () => {
  it("formats with a space before the unit and thousands separators", () => {
    expect(formatPercent(34)).toBe("34 %");
    expect(formatPercent(99.5, 1)).toBe("99.5 %");
    expect(formatPercent(Number.NaN)).toBe("0 %");
    expect(formatCount(1234)).toBe("1,234");
    expect(formatCount(Number.NaN)).toBe("0");
  });
});
