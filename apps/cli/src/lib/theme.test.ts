import { describe, it, expect } from "bun:test";
import {
  formatAge,
  formatExpiresAt,
  formatSectionHeader,
  formatDetail,
  formatCommand,
  formatStatusBullet,
  createInfoBox,
} from "./theme";

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("formatAge", () => {
  it("returns minutes for recent dates", () => {
    const date = new Date(Date.now() - 5 * 60_000);
    expect(formatAge(date)).toBe("5m");
  });

  it("returns 0m for just now", () => {
    expect(formatAge(new Date())).toBe("0m");
  });

  it("returns hours for multi-hour age", () => {
    const date = new Date(Date.now() - 3 * 3600_000);
    expect(formatAge(date)).toBe("3h");
  });

  it("returns days for multi-day age", () => {
    const date = new Date(Date.now() - 48 * 3600_000);
    expect(formatAge(date)).toBe("2d");
  });

  it("returns 0m for future dates", () => {
    const date = new Date(Date.now() + 60_000);
    expect(formatAge(date)).toBe("0m");
  });
});

describe("formatExpiresAt", () => {
  it("returns 'expired' for past timestamps", () => {
    const result = formatExpiresAt(Date.now() - 1000);
    expect(stripAnsi(result)).toBe("expired");
  });

  it("returns minutes for near-future", () => {
    const result = formatExpiresAt(Date.now() + 30 * 60_000 + 30_000);
    expect(result).toBe("30m");
  });

  it("returns hours for multi-hour remaining", () => {
    const result = formatExpiresAt(Date.now() + 2 * 3600_000 + 30_000);
    expect(result).toBe("2h");
  });

  it("returns days for multi-day remaining", () => {
    const result = formatExpiresAt(Date.now() + 3 * 86400_000 + 30_000);
    expect(result).toBe("3d");
  });
});

describe("formatSectionHeader", () => {
  it("produces text with label followed by colon", () => {
    const result = stripAnsi(formatSectionHeader("VMs"));
    expect(result).toContain("VMs:");
  });
});

describe("formatDetail", () => {
  it("formats label and value with indentation", () => {
    const result = stripAnsi(formatDetail("CPU", "4 cores"));
    expect(result).toBe("  CPU: 4 cores");
  });
});

describe("formatCommand", () => {
  it("formats command with indentation", () => {
    const result = stripAnsi(formatCommand("uva vm list"));
    expect(result).toBe("  uva vm list");
  });
});

describe("formatStatusBullet", () => {
  it("includes a bullet character", () => {
    const result = stripAnsi(formatStatusBullet("success", "all good"));
    expect(result).toContain("●");
    expect(result).toContain("all good");
  });

  it("works for all status types", () => {
    const statuses = ["success", "warning", "error", "info", "muted"] as const;
    for (const s of statuses) {
      const result = formatStatusBullet(s, "test");
      expect(stripAnsi(result)).toContain("● test");
    }
  });
});

describe("createInfoBox", () => {
  it("wraps content in a box", () => {
    const result = createInfoBox("hello");
    expect(result).toContain("hello");
    expect(result.length).toBeGreaterThan("hello".length);
  });
});
