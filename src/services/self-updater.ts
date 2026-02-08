/**
 * Self-updater — performs in-place updates of milaidy.
 *
 * Detects the installation method (npm global, bun global, Homebrew, Snap, etc.)
 * and runs the appropriate upgrade command. Falls back to npm if detection is
 * ambiguous.
 *
 * Design decisions:
 * - Runs the package manager as a child process so we get real exit codes.
 * - Streams stdout/stderr so the user sees progress in real time.
 * - Validates the update by re-reading the version after the install.
 * - Never auto-restarts the CLI — the user should restart manually.
 */

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ReleaseChannel } from "../config/types.milaidy.js";
import { CHANNEL_DIST_TAGS } from "../config/types.milaidy.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How milaidy was installed on this machine. */
export type InstallMethod =
  | "npm-global"
  | "bun-global"
  | "pnpm-global"
  | "homebrew"
  | "snap"
  | "apt"
  | "flatpak"
  | "local-dev"
  | "unknown";

export interface UpdateResult {
  /** Whether the update command succeeded (exit code 0). */
  success: boolean;
  /** The installation method that was used. */
  method: InstallMethod;
  /** The command that was executed. */
  command: string;
  /** Version before the update. */
  previousVersion: string;
  /** Version after the update (re-read from npm). */
  newVersion: string | null;
  /** Error message on failure. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Installation method detection
// ---------------------------------------------------------------------------

function whichSync(binary: string): string | null {
  try {
    return execSync(`which ${binary}`, {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function isInsideNodeModules(filePath: string): boolean {
  return filePath.includes("node_modules");
}

function isInsideHomebrew(filePath: string): boolean {
  return filePath.includes("/Cellar/") || filePath.includes("/homebrew/");
}

function isInsideSnap(filePath: string): boolean {
  return filePath.includes("/snap/");
}

function isInsideFlatpak(filePath: string): boolean {
  return (
    filePath.includes("/flatpak/") || filePath.includes("ai.milady.Milaidy")
  );
}

function isLocalDev(): boolean {
  // If package.json has a devDependencies section and we're running from source
  try {
    const rootPkg = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "../../package.json",
    );
    const content = JSON.parse(fs.readFileSync(rootPkg, "utf-8")) as {
      devDependencies?: Record<string, string>;
    };
    return content.devDependencies !== undefined;
  } catch {
    return false;
  }
}

/**
 * Detect how milaidy was installed on this system.
 */
export function detectInstallMethod(): InstallMethod {
  const milaidyBin = whichSync("milaidy");

  if (!milaidyBin) {
    // No global binary found — likely running from source or npx
    return isLocalDev() ? "local-dev" : "unknown";
  }

  // Resolve symlinks to find the actual install location
  let resolved: string;
  try {
    resolved = fs.realpathSync(milaidyBin);
  } catch {
    resolved = milaidyBin;
  }

  if (isInsideHomebrew(resolved)) return "homebrew";
  if (isInsideSnap(resolved)) return "snap";
  if (isInsideFlatpak(resolved)) return "flatpak";

  // Check if it's in an apt-installed location
  if (resolved.startsWith("/usr/") && !isInsideNodeModules(resolved)) {
    return "apt";
  }

  // Check for bun global
  if (resolved.includes("/.bun/")) return "bun-global";

  // Check for pnpm global
  if (resolved.includes("/pnpm/")) return "pnpm-global";

  // Default: npm global install
  if (isInsideNodeModules(resolved)) return "npm-global";

  return "unknown";
}

// ---------------------------------------------------------------------------
// Update commands per install method
// ---------------------------------------------------------------------------

function buildUpdateCommand(
  method: InstallMethod,
  channel: ReleaseChannel,
): { command: string; args: string[] } | null {
  const distTag = CHANNEL_DIST_TAGS[channel];
  const spec = channel === "stable" ? "milaidy@latest" : `milaidy@${distTag}`;

  switch (method) {
    case "npm-global":
      return { command: "npm", args: ["install", "-g", spec] };

    case "bun-global":
      return { command: "bun", args: ["install", "-g", spec] };

    case "pnpm-global":
      return { command: "pnpm", args: ["add", "-g", spec] };

    case "homebrew":
      return { command: "brew", args: ["upgrade", "milaidy"] };

    case "snap": {
      // Snap channel mapping: stable → stable, beta → beta, nightly → edge
      const snapChannel =
        channel === "nightly" ? "edge" : channel === "beta" ? "beta" : "stable";
      return {
        command: "sudo",
        args: ["snap", "refresh", "milaidy", `--channel=${snapChannel}`],
      };
    }

    case "apt":
      return {
        command: "sudo",
        args: [
          "apt-get",
          "update",
          "&&",
          "sudo",
          "apt-get",
          "install",
          "--only-upgrade",
          "milaidy",
        ],
      };

    case "flatpak":
      return {
        command: "flatpak",
        args: ["update", "ai.milady.Milaidy"],
      };

    case "local-dev":
      // Don't update local dev installs via the updater
      return null;

    case "unknown":
      // Fallback to npm
      return { command: "npm", args: ["install", "-g", spec] };
  }
}

// ---------------------------------------------------------------------------
// Execute update
// ---------------------------------------------------------------------------

/**
 * Run a command and stream output to the terminal.
 * Returns the exit code.
 */
function runCommand(
  command: string,
  args: string[],
): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["inherit", "inherit", "pipe"],
      shell: true,
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    child.on("error", (err) => {
      resolve({ exitCode: 1, stderr: err.message });
    });

    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stderr });
    });
  });
}

/**
 * Read the version of the globally installed milaidy after update.
 */
function readPostUpdateVersion(): string | null {
  try {
    const output = execSync("milaidy --version", {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    })
      .toString()
      .trim();
    // The version output may include a prefix like "milaidy/2.0.0"
    const match = output.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Perform a self-update of milaidy.
 *
 * @param currentVersion - The currently running version.
 * @param channel - The release channel to update to.
 * @returns Update result with success/failure info.
 */
export async function performUpdate(
  currentVersion: string,
  channel: ReleaseChannel,
): Promise<UpdateResult> {
  const method = detectInstallMethod();
  const cmdInfo = buildUpdateCommand(method, channel);

  if (!cmdInfo) {
    return {
      success: false,
      method,
      command: "",
      previousVersion: currentVersion,
      newVersion: null,
      error:
        method === "local-dev"
          ? "Cannot auto-update a local development install. Use git pull instead."
          : "Unable to determine update command for this installation method.",
    };
  }

  const commandString = `${cmdInfo.command} ${cmdInfo.args.join(" ")}`;
  const { exitCode, stderr } = await runCommand(cmdInfo.command, cmdInfo.args);

  if (exitCode !== 0) {
    return {
      success: false,
      method,
      command: commandString,
      previousVersion: currentVersion,
      newVersion: null,
      error: stderr || `Update command exited with code ${exitCode}.`,
    };
  }

  // Verify the update by reading the new version
  const newVersion = readPostUpdateVersion();

  return {
    success: true,
    method,
    command: commandString,
    previousVersion: currentVersion,
    newVersion,
    error: null,
  };
}
