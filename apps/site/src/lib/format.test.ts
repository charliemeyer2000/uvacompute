import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatStatus,
  formatDuration,
  formatTimeRemaining,
} from "./format";

describe("formatDate", () => {
  it("returns a locale string for a valid timestamp", () => {
    const ts = new Date("2025-01-15T12:30:00Z").getTime();
    const result = formatDate(ts);
    expect(result).toBe(new Date(ts).toLocaleString());
  });

  it("handles epoch zero", () => {
    expect(formatDate(0)).toBe(new Date(0).toLocaleString());
  });
});

describe("formatStatus", () => {
  it("replaces single underscore", () => {
    expect(formatStatus("not_found")).toBe("not found");
  });

  it("replaces multiple underscores", () => {
    expect(formatStatus("a_b_c")).toBe("a b c");
  });

  it("returns unchanged string when no underscores", () => {
    expect(formatStatus("running")).toBe("running");
  });

  it("handles empty string", () => {
    expect(formatStatus("")).toBe("");
  });
});

describe("formatDuration", () => {
  it("formats sub-second as milliseconds", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("formats seconds", () => {
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(59_999)).toBe("59s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(60_000)).toBe("1m 0s");
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(3_599_000)).toBe("59m 59s");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(3_600_000)).toBe("1h 0m");
    expect(formatDuration(5_400_000)).toBe("1h 30m");
    expect(formatDuration(86_400_000)).toBe("24h 0m");
  });
});

describe("formatTimeRemaining", () => {
  const NOW = 1_700_000_000_000;

  it('returns "expired" when deadline is in the past', () => {
    expect(formatTimeRemaining(NOW - 1, NOW)).toBe("expired");
  });

  it('returns "expired" when deadline equals now', () => {
    expect(formatTimeRemaining(NOW, NOW)).toBe("expired");
  });

  it("formats minutes-only remaining", () => {
    const thirtyMin = 30 * 60 * 1000;
    expect(formatTimeRemaining(NOW + thirtyMin, NOW)).toBe("30m remaining");
  });

  it("formats hours and minutes remaining", () => {
    const twoHoursThirty = 2 * 60 * 60 * 1000 + 30 * 60 * 1000;
    expect(formatTimeRemaining(NOW + twoHoursThirty, NOW)).toBe(
      "2h 30m remaining",
    );
  });

  it("shows 0m when less than a minute remains", () => {
    expect(formatTimeRemaining(NOW + 30_000, NOW)).toBe("0m remaining");
  });

  it("uses Date.now() when now is not provided", () => {
    const future = Date.now() + 3_600_000;
    const result = formatTimeRemaining(future);
    expect(result).toMatch(/\d+h? ?\d*m remaining/);
  });
});
