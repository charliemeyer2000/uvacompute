import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  compareVersions,
  formatElapsed,
  getBaseUrl,
  setNonInteractive,
  isNonInteractive,
} from "./utils";

describe("compareVersions", () => {
  it("returns true when latest is newer (patch)", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(true);
  });

  it("returns true when latest is newer (minor)", () => {
    expect(compareVersions("1.0.0", "1.1.0")).toBe(true);
  });

  it("returns true when latest is newer (major)", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(false);
  });

  it("returns false when current is newer", () => {
    expect(compareVersions("2.0.0", "1.0.0")).toBe(false);
  });

  it("returns false when current has higher minor", () => {
    expect(compareVersions("1.2.0", "1.1.0")).toBe(false);
  });

  it("returns false when current has higher patch", () => {
    expect(compareVersions("1.0.5", "1.0.3")).toBe(false);
  });

  it("handles missing patch segments", () => {
    expect(compareVersions("1.0", "1.0.1")).toBe(true);
  });

  it("handles multi-digit version numbers", () => {
    expect(compareVersions("1.9.0", "1.10.0")).toBe(true);
  });

  it("returns true for 0.0.0 vs 0.0.1", () => {
    expect(compareVersions("0.0.0", "0.0.1")).toBe(true);
  });
});

describe("formatElapsed", () => {
  it("formats sub-minute durations", () => {
    const now = Date.now();
    const result = formatElapsed(now - 30_000);
    expect(result).toBe("30s");
  });

  it("formats exactly 0 seconds", () => {
    const now = Date.now();
    const result = formatElapsed(now);
    expect(result).toBe("0s");
  });

  it("formats minutes with padded seconds", () => {
    const now = Date.now();
    const result = formatElapsed(now - 65_000);
    expect(result).toBe("1m05s");
  });

  it("formats larger minute values", () => {
    const now = Date.now();
    const result = formatElapsed(now - 600_000);
    expect(result).toBe("10m00s");
  });

  it("pads single-digit seconds", () => {
    const now = Date.now();
    const result = formatElapsed(now - 62_000);
    expect(result).toBe("1m02s");
  });
});

describe("getBaseUrl", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns SITE_URL env var when set", () => {
    process.env.SITE_URL = "https://custom.example.com";
    expect(getBaseUrl()).toBe("https://custom.example.com");
  });

  it("returns production URL in production mode", () => {
    delete process.env.SITE_URL;
    process.env.NODE_ENV = "production";
    expect(getBaseUrl()).toBe("https://uvacompute.com");
  });

  it("returns dev URL when not in production and no SITE_URL", () => {
    delete process.env.SITE_URL;
    process.env.NODE_ENV = "development";
    expect(getBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("setNonInteractive / isNonInteractive", () => {
  afterEach(() => {
    setNonInteractive(false);
  });

  it("defaults to false", () => {
    setNonInteractive(false);
    expect(isNonInteractive()).toBe(false);
  });

  it("can be set to true", () => {
    setNonInteractive(true);
    expect(isNonInteractive()).toBe(true);
  });

  it("can be toggled back to false", () => {
    setNonInteractive(true);
    setNonInteractive(false);
    expect(isNonInteractive()).toBe(false);
  });
});
