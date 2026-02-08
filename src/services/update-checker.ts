/**
 * Update checker — queries the npm registry for new versions of milaidy
 * based on the user's configured release channel (stable/beta/nightly).
 *
 * Design decisions:
 * - Uses the npm registry JSON API directly (no child_process) for speed and portability.
 * - Respects a configurable check interval to avoid hammering the registry.
 * - Stores last-check metadata in the user config so it persists across runs.
 * - Timeout-protected: a slow/offline registry never blocks CLI startup.
 */

import { loadMilaidyConfig, saveMilaidyConfig } from "../config/config.js";
import type { ReleaseChannel, UpdateConfig } from "../config/types.milaidy.js";
import { CHANNEL_DIST_TAGS } from "../config/types.milaidy.js";
import { VERSION } from "../runtime/version.js";
import { compareSemver } from "./version-compat.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PACKAGE_NAME = "milaidy";
const NPM_REGISTRY_URL = "https://registry.npmjs.org";

/** Default minimum seconds between registry checks. */
const DEFAULT_CHECK_INTERVAL_SECONDS = 14_400; // 4 hours

/** HTTP timeout for registry requests (ms). */
const REGISTRY_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of an update check. */
export interface UpdateCheckResult {
  /** Whether a newer version is available on the selected channel. */
  updateAvailable: boolean;
  /** The currently installed version. */
  currentVersion: string;
  /** The latest version on the selected channel, or null if the check failed. */
  latestVersion: string | null;
  /** The release channel that was checked. */
  channel: ReleaseChannel;
  /** The npm dist-tag that was queried. */
  distTag: string;
  /** Whether the check was served from cache (skipped due to interval). */
  cached: boolean;
  /** Error message if the check failed (network issues, etc.). */
  error: string | null;
}

/** Abbreviated npm packument shape (only fields we need). */
interface NpmDistTagsResponse {
  "dist-tags": Record<string, string>;
}

// ---------------------------------------------------------------------------
// Registry client
// ---------------------------------------------------------------------------

/**
 * Fetch the dist-tags for a package from the npm registry.
 * Returns null on timeout or network failure (never throws).
 */
async function fetchDistTags(): Promise<Record<string, string> | null> {
  const url = `${NPM_REGISTRY_URL}/${PACKAGE_NAME}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.npm.install-v1+json", // abbreviated metadata
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as NpmDistTagsResponse;
    return data["dist-tags"] ?? null;
  } catch {
    // Network error, timeout, abort — all non-fatal.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Check interval gating
// ---------------------------------------------------------------------------

function shouldSkipCheck(updateConfig: UpdateConfig | undefined): boolean {
  if (!updateConfig?.lastCheckAt) return false;

  const intervalSeconds =
    updateConfig.checkIntervalSeconds ?? DEFAULT_CHECK_INTERVAL_SECONDS;
  const lastCheck = new Date(updateConfig.lastCheckAt).getTime();
  const elapsed = (Date.now() - lastCheck) / 1_000;

  return elapsed < intervalSeconds;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the effective release channel from config, env, or default.
 */
export function resolveChannel(
  updateConfig: UpdateConfig | undefined,
): ReleaseChannel {
  // Env var override (useful for CI and testing).
  const envChannel = process.env.MILAIDY_UPDATE_CHANNEL?.trim().toLowerCase();
  if (
    envChannel === "stable" ||
    envChannel === "beta" ||
    envChannel === "nightly"
  ) {
    return envChannel;
  }
  return updateConfig?.channel ?? "stable";
}

/**
 * Check whether a newer version of milaidy is available on the user's
 * configured release channel.
 *
 * This respects the check interval and will return a cached result if a
 * check was performed recently enough. Pass `force: true` to bypass.
 */
export async function checkForUpdate(options?: {
  force?: boolean;
}): Promise<UpdateCheckResult> {
  const config = loadMilaidyConfig();
  const updateConfig = config.update;
  const channel = resolveChannel(updateConfig);
  const distTag = CHANNEL_DIST_TAGS[channel];

  // Gate: skip if checked recently (unless forced).
  if (!options?.force && shouldSkipCheck(updateConfig)) {
    return {
      updateAvailable: updateConfig?.lastCheckVersion
        ? (compareSemver(VERSION, updateConfig.lastCheckVersion) ?? 0) < 0
        : false,
      currentVersion: VERSION,
      latestVersion: updateConfig?.lastCheckVersion ?? null,
      channel,
      distTag,
      cached: true,
      error: null,
    };
  }

  // Fetch from registry.
  const distTags = await fetchDistTags();

  if (!distTags) {
    return {
      updateAvailable: false,
      currentVersion: VERSION,
      latestVersion: null,
      channel,
      distTag,
      cached: false,
      error: "Unable to reach the npm registry. Check your network connection.",
    };
  }

  const latestVersion = distTags[distTag] ?? null;

  if (!latestVersion) {
    return {
      updateAvailable: false,
      currentVersion: VERSION,
      latestVersion: null,
      channel,
      distTag,
      cached: false,
      error: `No version found for dist-tag "${distTag}". The "${channel}" channel may not have any published releases yet.`,
    };
  }

  const cmp = compareSemver(VERSION, latestVersion);
  const updateAvailable = cmp !== null && cmp < 0;

  // Persist last-check metadata.
  const updatedConfig = {
    ...config,
    update: {
      ...config.update,
      lastCheckAt: new Date().toISOString(),
      lastCheckVersion: latestVersion,
    },
  };
  try {
    saveMilaidyConfig(updatedConfig);
  } catch {
    // Non-fatal: config write failure shouldn't break the check.
  }

  return {
    updateAvailable,
    currentVersion: VERSION,
    latestVersion,
    channel,
    distTag,
    cached: false,
    error: null,
  };
}

/**
 * Quick helper: returns all available dist-tag versions (for `milaidy version status`).
 */
export async function fetchAllChannelVersions(): Promise<
  Record<ReleaseChannel, string | null>
> {
  const distTags = await fetchDistTags();
  return {
    stable: distTags?.["latest"] ?? null,
    beta: distTags?.["beta"] ?? null,
    nightly: distTags?.["nightly"] ?? null,
  };
}
