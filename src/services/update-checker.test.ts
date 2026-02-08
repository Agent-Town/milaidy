/**
 * Tests for the update checker service.
 *
 * These tests validate the core logic for checking npm for new versions
 * and resolving release channels, without making real network requests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReleaseChannel, UpdateConfig } from "../config/types.milaidy.js";
import { CHANNEL_DIST_TAGS } from "../config/types.milaidy.js";

// ---------------------------------------------------------------------------
// We test the pure logic functions by importing them directly.
// Network-dependent functions are tested with mocked fetch.
// ---------------------------------------------------------------------------

// Mock config module before imports
vi.mock("../config/config.js", () => ({
  loadMilaidyConfig: vi.fn(() => ({})),
  saveMilaidyConfig: vi.fn(),
}));

// Mock version module
vi.mock("../runtime/version.js", () => ({
  VERSION: "2.0.0-alpha.7",
}));

import { loadMilaidyConfig, saveMilaidyConfig } from "../config/config.js";
import {
  checkForUpdate,
  fetchAllChannelVersions,
  resolveChannel,
} from "./update-checker.js";

// ============================================================================
// 1. Channel resolution
// ============================================================================

describe("resolveChannel", () => {
  const originalEnv = process.env.MILAIDY_UPDATE_CHANNEL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MILAIDY_UPDATE_CHANNEL;
    } else {
      process.env.MILAIDY_UPDATE_CHANNEL = originalEnv;
    }
  });

  it("defaults to stable when no config is set", () => {
    expect(resolveChannel(undefined)).toBe("stable");
  });

  it("returns the configured channel", () => {
    expect(resolveChannel({ channel: "beta" })).toBe("beta");
    expect(resolveChannel({ channel: "nightly" })).toBe("nightly");
    expect(resolveChannel({ channel: "stable" })).toBe("stable");
  });

  it("respects MILAIDY_UPDATE_CHANNEL env var override", () => {
    process.env.MILAIDY_UPDATE_CHANNEL = "nightly";
    expect(resolveChannel({ channel: "stable" })).toBe("nightly");
  });

  it("ignores invalid env var values", () => {
    process.env.MILAIDY_UPDATE_CHANNEL = "invalid";
    expect(resolveChannel({ channel: "beta" })).toBe("beta");
  });

  it("handles env var with extra whitespace", () => {
    process.env.MILAIDY_UPDATE_CHANNEL = "  beta  ";
    expect(resolveChannel({ channel: "stable" })).toBe("beta");
  });

  it("handles env var case-insensitively", () => {
    process.env.MILAIDY_UPDATE_CHANNEL = "NIGHTLY";
    expect(resolveChannel(undefined)).toBe("nightly");
  });
});

// ============================================================================
// 2. Channel dist-tag mapping
// ============================================================================

describe("CHANNEL_DIST_TAGS", () => {
  it("maps stable to latest", () => {
    expect(CHANNEL_DIST_TAGS.stable).toBe("latest");
  });

  it("maps beta to beta", () => {
    expect(CHANNEL_DIST_TAGS.beta).toBe("beta");
  });

  it("maps nightly to nightly", () => {
    expect(CHANNEL_DIST_TAGS.nightly).toBe("nightly");
  });

  it("covers all channel types", () => {
    const channels: ReleaseChannel[] = ["stable", "beta", "nightly"];
    for (const channel of channels) {
      expect(CHANNEL_DIST_TAGS[channel]).toBeDefined();
      expect(typeof CHANNEL_DIST_TAGS[channel]).toBe("string");
    }
  });
});

// ============================================================================
// 3. Update check with mocked fetch
// ============================================================================

describe("checkForUpdate", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    vi.mocked(loadMilaidyConfig).mockReturnValue({});
    vi.mocked(saveMilaidyConfig).mockImplementation(() => {});
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects an available update on stable channel", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": {
          latest: "2.1.0",
          beta: "2.1.0-beta.1",
          nightly: "2.1.0-nightly.20260208",
        },
      }),
    });

    const result = await checkForUpdate({ force: true });

    expect(result.updateAvailable).toBe(true);
    expect(result.currentVersion).toBe("2.0.0-alpha.7");
    expect(result.latestVersion).toBe("2.1.0");
    expect(result.channel).toBe("stable");
    expect(result.distTag).toBe("latest");
    expect(result.cached).toBe(false);
    expect(result.error).toBeNull();
  });

  it("reports no update when already on latest", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "2.0.0-alpha.7" },
      }),
    });

    const result = await checkForUpdate({ force: true });

    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBe("2.0.0-alpha.7");
  });

  it("handles network failure gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const result = await checkForUpdate({ force: true });

    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBeNull();
    expect(result.error).toContain("npm registry");
  });

  it("handles non-200 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    const result = await checkForUpdate({ force: true });

    expect(result.updateAvailable).toBe(false);
    expect(result.error).toContain("npm registry");
  });

  it("handles missing dist-tag", async () => {
    vi.mocked(loadMilaidyConfig).mockReturnValue({
      update: { channel: "nightly" },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "2.0.0" },
        // No "nightly" tag
      }),
    });

    const result = await checkForUpdate({ force: true });

    expect(result.updateAvailable).toBe(false);
    expect(result.error).toContain("nightly");
    expect(result.error).toContain("not have any published releases");
  });

  it("saves last-check metadata to config", async () => {
    vi.mocked(saveMilaidyConfig).mockClear();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "2.1.0" },
      }),
    });

    await checkForUpdate({ force: true });

    expect(saveMilaidyConfig).toHaveBeenCalledOnce();
    const savedConfig = vi.mocked(saveMilaidyConfig).mock.calls[0][0];
    expect(savedConfig.update?.lastCheckAt).toBeDefined();
    expect(savedConfig.update?.lastCheckVersion).toBe("2.1.0");
  });

  it("returns cached result within check interval", async () => {
    const recentCheck = new Date().toISOString();
    vi.mocked(loadMilaidyConfig).mockReturnValue({
      update: {
        lastCheckAt: recentCheck,
        lastCheckVersion: "2.1.0",
        checkIntervalSeconds: 3600,
      },
    });

    const result = await checkForUpdate();

    expect(result.cached).toBe(true);
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe("2.1.0");
    // Should NOT have called fetch
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("bypasses cache when force is true", async () => {
    const recentCheck = new Date().toISOString();
    vi.mocked(loadMilaidyConfig).mockReturnValue({
      update: {
        lastCheckAt: recentCheck,
        lastCheckVersion: "2.1.0",
        checkIntervalSeconds: 3600,
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "2.2.0" },
      }),
    });

    const result = await checkForUpdate({ force: true });

    expect(result.cached).toBe(false);
    expect(result.latestVersion).toBe("2.2.0");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("uses beta channel when configured", async () => {
    vi.mocked(loadMilaidyConfig).mockReturnValue({
      update: { channel: "beta" },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "2.0.0", beta: "2.1.0-beta.3" },
      }),
    });

    const result = await checkForUpdate({ force: true });

    expect(result.channel).toBe("beta");
    expect(result.distTag).toBe("beta");
    expect(result.latestVersion).toBe("2.1.0-beta.3");
    expect(result.updateAvailable).toBe(true);
  });
});

// ============================================================================
// 4. Fetch all channel versions
// ============================================================================

describe("fetchAllChannelVersions", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns versions for all channels", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": {
          latest: "2.0.0",
          beta: "2.1.0-beta.1",
          nightly: "2.1.0-nightly.20260208",
        },
      }),
    });

    const versions = await fetchAllChannelVersions();

    expect(versions.stable).toBe("2.0.0");
    expect(versions.beta).toBe("2.1.0-beta.1");
    expect(versions.nightly).toBe("2.1.0-nightly.20260208");
  });

  it("returns null for unpublished channels", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "2.0.0" },
      }),
    });

    const versions = await fetchAllChannelVersions();

    expect(versions.stable).toBe("2.0.0");
    expect(versions.beta).toBeNull();
    expect(versions.nightly).toBeNull();
  });

  it("returns all nulls on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("offline"));

    const versions = await fetchAllChannelVersions();

    expect(versions.stable).toBeNull();
    expect(versions.beta).toBeNull();
    expect(versions.nightly).toBeNull();
  });
});
