/**
 * Tests for the startup update notifier.
 *
 * Validates the guard conditions (CI, TTY, config, dedup) and that
 * the notifier actually calls checkForUpdate and writes output.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("../config/config.js", () => ({
  loadMilaidyConfig: vi.fn(() => ({})),
}));

vi.mock("./update-checker.js", () => ({
  checkForUpdate: vi.fn(),
  resolveChannel: vi.fn(() => "stable"),
}));

vi.mock("../terminal/theme.js", () => ({
  theme: {
    accent: (s: string) => `[accent:${s}]`,
    muted: (s: string) => `[muted:${s}]`,
    success: (s: string) => `[success:${s}]`,
    command: (s: string) => `[command:${s}]`,
  },
}));

// ============================================================================
// Helpers
// ============================================================================

/**
 * We need to re-import the module for each test because it has module-level
 * state (`let notified = false`). Vitest's module cache must be cleared.
 */
async function importFreshNotifier() {
  // Reset the module registry to get a fresh `notified` flag
  vi.resetModules();

  // Re-mock after reset
  vi.doMock("../config/config.js", () => ({
    loadMilaidyConfig: vi.fn(() => ({})),
  }));
  vi.doMock("./update-checker.js", () => ({
    checkForUpdate: vi.fn(),
    resolveChannel: vi.fn(() => "stable"),
  }));
  vi.doMock("../terminal/theme.js", () => ({
    theme: {
      accent: (s: string) => `[accent:${s}]`,
      muted: (s: string) => `[muted:${s}]`,
      success: (s: string) => `[success:${s}]`,
      command: (s: string) => `[command:${s}]`,
    },
  }));

  const mod = await import("./update-notifier.js");
  const config = await import("../config/config.js");
  const checker = await import("./update-checker.js");
  return {
    scheduleUpdateNotification: mod.scheduleUpdateNotification,
    config,
    checker,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("scheduleUpdateNotification", () => {
  const originalCI = process.env.CI;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.CI;
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    // Pretend stderr is a TTY
    Object.defineProperty(process.stderr, "isTTY", {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    } else {
      delete process.env.CI;
    }
  });

  it("does not check in CI environments", async () => {
    process.env.CI = "true";
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();

    scheduleUpdateNotification();

    // Allow any microtasks to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(checker.checkForUpdate).not.toHaveBeenCalled();
  });

  it("does not check when stderr is not a TTY", async () => {
    Object.defineProperty(process.stderr, "isTTY", {
      value: false,
      configurable: true,
    });

    const { scheduleUpdateNotification, checker } = await importFreshNotifier();

    scheduleUpdateNotification();
    await new Promise((r) => setTimeout(r, 10));

    expect(checker.checkForUpdate).not.toHaveBeenCalled();
  });

  it("does not check when checkOnStart is false", async () => {
    const { scheduleUpdateNotification, config, checker } =
      await importFreshNotifier();
    vi.mocked(config.loadMilaidyConfig).mockReturnValue({
      update: { checkOnStart: false },
    });

    scheduleUpdateNotification();
    await new Promise((r) => setTimeout(r, 10));

    expect(checker.checkForUpdate).not.toHaveBeenCalled();
  });

  it("calls checkForUpdate when conditions are met", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockResolvedValue({
      updateAvailable: false,
      currentVersion: "2.0.0",
      latestVersion: "2.0.0",
      channel: "stable",
      distTag: "latest",
      cached: false,
      error: null,
    });

    scheduleUpdateNotification();
    await new Promise((r) => setTimeout(r, 50));

    expect(checker.checkForUpdate).toHaveBeenCalledOnce();
  });

  it("writes update notice to stderr when update is available", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: "2.0.0",
      latestVersion: "2.1.0",
      channel: "stable",
      distTag: "latest",
      cached: false,
      error: null,
    });

    scheduleUpdateNotification();
    await new Promise((r) => setTimeout(r, 50));

    const output = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(output).toContain("Update available");
    expect(output).toContain("2.0.0");
    expect(output).toContain("2.1.0");
    expect(output).toContain("milaidy update");
  });

  it("does not write notice when no update is available", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockResolvedValue({
      updateAvailable: false,
      currentVersion: "2.0.0",
      latestVersion: "2.0.0",
      channel: "stable",
      distTag: "latest",
      cached: false,
      error: null,
    });

    scheduleUpdateNotification();
    await new Promise((r) => setTimeout(r, 50));

    // stderr should NOT have any update notice
    const output = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(output).not.toContain("Update available");
  });

  it("only fires once per process (dedup)", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockResolvedValue({
      updateAvailable: false,
      currentVersion: "2.0.0",
      latestVersion: "2.0.0",
      channel: "stable",
      distTag: "latest",
      cached: false,
      error: null,
    });

    scheduleUpdateNotification();
    scheduleUpdateNotification(); // second call
    scheduleUpdateNotification(); // third call
    await new Promise((r) => setTimeout(r, 50));

    // checkForUpdate should only be called ONCE despite 3 calls
    expect(checker.checkForUpdate).toHaveBeenCalledOnce();
  });

  it("includes channel suffix for non-stable channels", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: "2.0.0",
      latestVersion: "2.1.0-beta.1",
      channel: "beta",
      distTag: "beta",
      cached: false,
      error: null,
    });
    vi.mocked(checker.resolveChannel).mockReturnValue("beta");

    scheduleUpdateNotification();
    await new Promise((r) => setTimeout(r, 50));

    const output = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(output).toContain("beta");
  });

  it("silently ignores checkForUpdate rejection", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockRejectedValue(
      new Error("something broke"),
    );

    // Should not throw
    scheduleUpdateNotification();
    await new Promise((r) => setTimeout(r, 50));

    // No output, no crash
    const output = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(output).not.toContain("Update available");
  });

  it("does not write notice when latestVersion is null", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockResolvedValue({
      updateAvailable: true, // available but latestVersion is null (shouldn't happen, but guard)
      currentVersion: "2.0.0",
      latestVersion: null,
      channel: "stable",
      distTag: "latest",
      cached: false,
      error: null,
    });

    scheduleUpdateNotification();
    await new Promise((r) => setTimeout(r, 50));

    const output = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(output).not.toContain("Update available");
  });

  it("does not include channel suffix for stable channel", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: "2.0.0",
      latestVersion: "2.1.0",
      channel: "stable",
      distTag: "latest",
      cached: false,
      error: null,
    });
    vi.mocked(checker.resolveChannel).mockReturnValue("stable");

    scheduleUpdateNotification();
    await new Promise((r) => setTimeout(r, 50));

    const output = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(output).toContain("Update available");
    // Should NOT have "(stable)" suffix — only non-stable channels show the suffix
    expect(output).not.toContain("(stable)");
    expect(output).not.toContain("stable");
  });
});
