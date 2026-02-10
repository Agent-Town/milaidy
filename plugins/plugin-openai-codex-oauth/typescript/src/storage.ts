import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type CodexOAuthToken = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
  obtained_at?: string; // ISO
};

export type OAuthStoreShape = Record<string, unknown>;

function resolveStateDir(): string {
  const override = process.env.MILAIDY_STATE_DIR?.trim();
  if (override) {
    if (override.startsWith("~")) {
      return path.resolve(override.replace(/^~(?=$|[\\/])/, os.homedir()));
    }
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

export function readOAuthStore(): OAuthStoreShape {
  const p = resolveOAuthPath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as OAuthStoreShape;
  } catch {
    return {};
  }
}

export function writeOAuthStore(store: OAuthStoreShape): void {
  const p = resolveOAuthPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(store, null, 2) + "\n");
}

const KEY = "openai-codex";

export function readCodexToken(): CodexOAuthToken | null {
  const store = readOAuthStore();
  const raw = store[KEY];
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const access_token = String(obj.access_token ?? "");
  const refresh_token = String(obj.refresh_token ?? "");
  const expires_in = Number(obj.expires_in ?? 0);
  if (!access_token || !refresh_token || !Number.isFinite(expires_in) || expires_in <= 0) {
    return null;
  }
  return {
    access_token,
    refresh_token,
    expires_in,
    token_type: obj.token_type ? String(obj.token_type) : undefined,
    scope: obj.scope ? String(obj.scope) : undefined,
    obtained_at: obj.obtained_at ? String(obj.obtained_at) : undefined,
  };
}

export function writeCodexToken(token: CodexOAuthToken): void {
  const store = readOAuthStore();
  store[KEY] = token;
  writeOAuthStore(store);
}

export function deleteCodexToken(): void {
  const store = readOAuthStore();
  if (KEY in store) {
    delete store[KEY];
    writeOAuthStore(store);
  }
}
