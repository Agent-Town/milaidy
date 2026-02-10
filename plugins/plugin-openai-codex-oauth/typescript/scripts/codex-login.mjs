#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

import { loginOpenAICodex } from "@mariozechner/pi-ai";

const PROVIDER_KEY = "openai-codex";

function resolveOAuthPath() {
  const overrideDir = (process.env.MILAIDY_OAUTH_DIR || "").trim();
  const stateDirRaw = (process.env.MILAIDY_STATE_DIR || path.join(os.homedir(), ".milaidy")).trim();
  const stateDir = stateDirRaw.startsWith("~") ? path.join(os.homedir(), stateDirRaw.slice(1)) : stateDirRaw;
  const base = overrideDir
    ? (overrideDir.startsWith("~") ? path.join(os.homedir(), overrideDir.slice(1)) : overrideDir)
    : path.join(stateDir, "credentials");
  return path.join(base, "oauth.json");
}

function readOAuthStore() {
  const p = resolveOAuthPath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

function writeOAuthStore(store) {
  const p = resolveOAuthPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(store, null, 2) + "\n");
}

function askLine(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (ans) => {
      rl.close();
      resolve(ans);
    });
  });
}

function mask(s) {
  if (!s) return "";
  if (s.length <= 8) return "****";
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function looksLikeRedirectUrl(s) {
  if (!s) return false;
  if (!(s.startsWith("http://") || s.startsWith("https://"))) return false;
  return s.includes("code=");
}

async function promptForRedirectUrl() {
  while (true) {
    const pasted = String(
      await askLine("Paste the final redirect URL here (or 'q' to quit): ")
    ).trim();

    if (!pasted) continue;
    if (pasted.toLowerCase() === "q") return null;

    if (looksLikeRedirectUrl(pasted)) return pasted;

    console.log("[codex-login] That doesn't look like a final redirect URL (expected it to contain 'code='). Try again.");
  }
}

async function main() {
  console.log("[codex-login] Starting OpenAI Codex OAuth…");

  const creds = await loginOpenAICodex({
    // IMPORTANT: pi-ai provides the URL via onAuth({ url, instructions })
    onAuth: async ({ url, instructions }) => {
      console.log("\n[codex-login] Open this URL in your browser:\n");
      console.log(url);
      console.log("\n" + (instructions ?? "Complete login, then copy/paste the FINAL redirect URL here.") + "\n");
      const redirectUrl = await promptForRedirectUrl();
      // pi-ai expects the final redirect URL containing ?code=...
      return redirectUrl ?? "";
    },
    onProgress: async (msg) => {
      if (msg) console.log(msg);
    },
    onPrompt: async (msg) => {
      // Some versions may still emit prompts; print them.
      if (msg) console.log("\n" + msg + "\n");
      return "";
    },
  });

  if (!creds) {
    console.error("[codex-login] No credentials returned.");
    process.exit(1);
  }

  const token = {
    ...creds,
    obtained_at: new Date().toISOString(),
  };

  const store = readOAuthStore();
  store[PROVIDER_KEY] = token;
  writeOAuthStore(store);

  console.log("\n[codex-login] Success. Wrote credentials:");
  console.log(`- path: ${resolveOAuthPath()}`);
  console.log(`- access_token: ${mask(token.access_token)}`);
  console.log(`- refresh_token: ${mask(token.refresh_token)}`);
}

main().catch((e) => {
  console.error("[codex-login] Fatal:", e);
  process.exit(1);
});
