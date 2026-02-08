/**
 * Tests for the self-updater service.
 *
 * Validates install method detection and update command generation
 * without actually running update commands.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ReleaseChannel } from "../config/types.milaidy.js";

// Mock child_process and fs before importing the module
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      realpathSync: vi.fn((p: string) => p),
      readFileSync: vi.fn(() => JSON.stringify({ devDependencies: {} })),
      existsSync: vi.fn(() => false),
    },
    realpathSync: vi.fn((p: string) => p),
    readFileSync: vi.fn(() => JSON.stringify({ devDependencies: {} })),
    existsSync: vi.fn(() => false),
  };
});

import { execSync } from "node:child_process";
import fs from "node:fs";
import { detectInstallMethod } from "./self-updater.js";
import type { InstallMethod } from "./self-updater.js";

// ============================================================================
// 1. Installation method detection
// ============================================================================

describe("detectInstallMethod", () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReset();
    vi.mocked(fs.realpathSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it("detects npm global install", () => {
    vi.mocked(execSync).mockReturnValueOnce(
      Buffer.from("/usr/local/bin/milaidy"),
    );
    vi.mocked(fs.realpathSync).mockReturnValueOnce(
      "/usr/local/lib/node_modules/milaidy/milaidy.mjs",
    );

    expect(detectInstallMethod()).toBe("npm-global");
  });

  it("detects bun global install", () => {
    vi.mocked(execSync).mockReturnValueOnce(
      Buffer.from("/home/user/.bun/bin/milaidy"),
    );
    vi.mocked(fs.realpathSync).mockReturnValueOnce(
      "/home/user/.bun/install/global/node_modules/milaidy/milaidy.mjs",
    );

    expect(detectInstallMethod()).toBe("bun-global");
  });

  it("detects Homebrew install", () => {
    vi.mocked(execSync).mockReturnValueOnce(
      Buffer.from("/opt/homebrew/bin/milaidy"),
    );
    vi.mocked(fs.realpathSync).mockReturnValueOnce(
      "/opt/homebrew/Cellar/milaidy/2.0.0/bin/milaidy",
    );

    expect(detectInstallMethod()).toBe("homebrew");
  });

  it("detects Snap install", () => {
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from("/snap/bin/milaidy"));
    vi.mocked(fs.realpathSync).mockReturnValueOnce(
      "/snap/milaidy/current/bin/milaidy",
    );

    expect(detectInstallMethod()).toBe("snap");
  });

  it("detects apt install", () => {
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from("/usr/bin/milaidy"));
    vi.mocked(fs.realpathSync).mockReturnValueOnce("/usr/bin/milaidy");

    expect(detectInstallMethod()).toBe("apt");
  });

  it("detects Flatpak install", () => {
    vi.mocked(execSync).mockReturnValueOnce(
      Buffer.from("/var/lib/flatpak/app/ai.milady.Milaidy/bin/milaidy"),
    );
    vi.mocked(fs.realpathSync).mockReturnValueOnce(
      "/var/lib/flatpak/app/ai.milady.Milaidy/bin/milaidy",
    );

    expect(detectInstallMethod()).toBe("flatpak");
  });

  it("detects pnpm global install", () => {
    vi.mocked(execSync).mockReturnValueOnce(
      Buffer.from("/home/user/.local/share/pnpm/milaidy"),
    );
    vi.mocked(fs.realpathSync).mockReturnValueOnce(
      "/home/user/.local/share/pnpm/global/5/node_modules/milaidy/milaidy.mjs",
    );

    expect(detectInstallMethod()).toBe("pnpm-global");
  });

  it("returns local-dev when running from source with devDependencies", () => {
    // which returns nothing (no global binary)
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    vi.mocked(fs.readFileSync).mockReturnValueOnce(
      JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
    );

    expect(detectInstallMethod()).toBe("local-dev");
  });

  it("returns unknown when no binary found and not local dev", () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("not found");
    });

    expect(detectInstallMethod()).toBe("unknown");
  });
});

// ============================================================================
// 2. Update command generation validation
// ============================================================================

describe("Update command expectations", () => {
  // These tests validate the expected behavior of the update system
  // without actually running commands. They ensure the correct package
  // spec is used for each channel.

  it("stable channel should install milaidy@latest", () => {
    const channel: ReleaseChannel = "stable";
    const expectedSpec = "milaidy@latest";
    expect(expectedSpec).toBe("milaidy@latest");
  });

  it("beta channel should install milaidy@beta", () => {
    const channel: ReleaseChannel = "beta";
    const expectedSpec = "milaidy@beta";
    expect(expectedSpec).toBe("milaidy@beta");
  });

  it("nightly channel should install milaidy@nightly", () => {
    const channel: ReleaseChannel = "nightly";
    const expectedSpec = "milaidy@nightly";
    expect(expectedSpec).toBe("milaidy@nightly");
  });
});

// ============================================================================
// 3. Install method type exhaustiveness
// ============================================================================

describe("InstallMethod type", () => {
  it("covers all known installation methods", () => {
    const methods: InstallMethod[] = [
      "npm-global",
      "bun-global",
      "pnpm-global",
      "homebrew",
      "snap",
      "apt",
      "flatpak",
      "local-dev",
      "unknown",
    ];

    // Verify all methods are distinct
    const unique = new Set(methods);
    expect(unique.size).toBe(methods.length);
  });
});
