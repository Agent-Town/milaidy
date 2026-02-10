import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type PiAiCodexCreds = {
  access: string;
  refresh: string;
  expires: number; // unix ms
  accountId?: string;
  obtained_at?: string;
};

function resolveStateDir(): string {
  const override = process.env.MILAIDY_STATE_DIR?.trim();
  if (override) {
    if (override.startsWith("~")) return path.resolve(override.replace(/^~(?=$|[\\/])/, os.homedir()));
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".milaidy");
}

export function resolveOAuthPath(): string {
  const override = process.env.MILAIDY_OAUTH_DIR?.trim();
  const base = override
    ? override.startsWith("~")
      ? path.resolve(override.replace(/^~(?=$|[\\/])/, os.homedir()))
      : path.resolve(override)
    : path.join(resolveStateDir(), "credentials");
  return path.join(base, "oauth.json");
}

export function readCodexCreds(): PiAiCodexCreds | null {
  const p = resolveOAuthPath();
  if (!fs.existsSync(p)) return null;
  try {
    const store = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, any>;
    const raw = store["openai-codex"];
    if (!raw || typeof raw !== "object") return null;
    const access = String(raw.access ?? "");
    const refresh = String(raw.refresh ?? "");
    const expires = Number(raw.expires ?? 0);
    if (!access || !refresh || !Number.isFinite(expires) || expires <= 0) return null;
    return {
      access,
      refresh,
      expires,
      accountId: raw.accountId ? String(raw.accountId) : undefined,
      obtained_at: raw.obtained_at ? String(raw.obtained_at) : undefined,
    };
  } catch {
    return null;
  }
}
