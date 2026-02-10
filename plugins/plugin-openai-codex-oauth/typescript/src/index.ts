import http from "node:http";
import { URL } from "node:url";

import { ModelType, type Plugin } from "@elizaos/core";
import { loginOpenAICodex } from "@mariozechner/pi-ai";
import { dbg } from "./log.js";

import {
  deleteCodexToken,
  readCodexToken,
  resolveOAuthPath,
  type CodexOAuthToken,
  writeCodexToken,
} from "./storage.js";
import { readCodexCreds } from "./storage-codex.js";
import { initCodexOAuthTextDelegates } from "./bootstrap.js";

function helpText(): string {
  return [
    "Codex OAuth commands:",
    "- /codex login              Start OAuth flow",
    "- /codex paste <redirect_url> Paste redirect URL if callback didn't auto-complete",
    "- /codex status             Show token status",
    "- /codex logout             Remove stored token",
  ].join("\n");
}

function mask(s: string): string {
  if (!s) return "";
  if (s.length <= 8) return "****";
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function parseCodexPaste(text: string): string | null {
  const trimmed = text.trim();
  const m = trimmed.match(/^\/codex\s+paste\s+(.*)$/i);
  const candidate = (m ? m[1] : trimmed).trim();
  if (!candidate) return null;
  if (!candidate.startsWith("http://") && !candidate.startsWith("https://")) return null;
  return candidate;
}

async function startLocalCallbackServer(params: {
  port: number;
  onRedirect: (url: string) => void;
}): Promise<{ close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url ?? "/", `http://127.0.0.1:${params.port}`);
      const code = u.searchParams.get("code");
      const state = u.searchParams.get("state");
      if (code && state) {
        params.onRedirect(u.toString());
        res.statusCode = 200;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end("OK. You can close this tab and return to Milaidy.");
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("Milaidy Codex OAuth callback server is running.");
    } catch {
      res.statusCode = 500;
      res.end("error");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(params.port, "127.0.0.1", () => resolve());
  });

  return {
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function envBool(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const v = String(raw).toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function hasModel(runtime: any, type: any): boolean {
  try {
    return Boolean(runtime?.getModel?.(type));
  } catch {
    return false;
  }
}

async function selfTestModel(runtime: any, type: any) {
  try {
    if (typeof runtime?.useModel !== "function") {
      dbg(runtime, `[codex-oauth] self-test skipped (no runtime.useModel)`);
      return;
    }
    const res = await runtime.useModel(type, { prompt: "ping", modelType: type });
    dbg(runtime, `[codex-oauth] self-test ${String(type)} OK (resType=${typeof res})`);
  } catch (e: any) {
    dbg(runtime, `[codex-oauth] self-test ${String(type)} FAILED: ${e?.message ?? String(e)}`);
  }
}

export const plugin: Plugin = {
  name: "openai-codex-oauth",
  description: "OpenAI Codex OAuth (subscription) login + bootstrap provider for TEXT_SMALL/TEXT_LARGE.",

  init: async (runtime: any) => {
    // Register early so evaluators that run during startup (personality/security) don't race us.
    const { enabled, registered } = await initCodexOAuthTextDelegates(runtime);
    dbg(runtime, `[codex-oauth] init: enabled=${enabled} registered=${registered.join(",") || "(none)"}`);
  },

  providers: [
    {
      name: "codex_oauth_bootstrap_text_delegates",
      description: "Bootstrap TEXT_SMALL/TEXT_LARGE model handlers if missing (Codex OAuth plugin)",
      get: async (runtime: any, message: any) => {
        const creds = readCodexCreds();
        const enabled = Boolean(creds?.access);
        dbg(runtime, `[codex-oauth] provider bootstrap: enabled=${enabled} (creds ${enabled ? 'present' : 'missing'})`);
        dbg(runtime, `[codex-oauth] provider bootstrap: typeof registerModel=${typeof runtime?.registerModel} typeof getModel=${typeof runtime?.getModel}`);

        const keySmall = String(ModelType.TEXT_SMALL);
        const keyLarge = String(ModelType.TEXT_LARGE);

        const beforeSmall = runtime?.models && typeof runtime.models.get === "function"
          ? Boolean(runtime.models.get(keySmall)?.length)
          : false;
        const beforeLarge = runtime?.models && typeof runtime.models.get === "function"
          ? Boolean(runtime.models.get(keyLarge)?.length)
          : false;
        dbg(runtime, `[codex-oauth] provider bootstrap: before small=${beforeSmall} large=${beforeLarge}`);

        if (enabled && typeof runtime?.registerModel === "function") {
          // Only-if-missing: do not override existing user providers.
          if (!beforeSmall) await initCodexOAuthTextDelegates(runtime);
          if (!beforeLarge) await initCodexOAuthTextDelegates(runtime);

          // Verify via the exact lookup path Eliza uses.
          await selfTestModel(runtime, keySmall);
          await selfTestModel(runtime, keyLarge);
        }

        const afterSmall = runtime?.models && typeof runtime.models.get === "function"
          ? Boolean(runtime.models.get(keySmall)?.length)
          : false;
        const afterLarge = runtime?.models && typeof runtime.models.get === "function"
          ? Boolean(runtime.models.get(keyLarge)?.length)
          : false;
        dbg(runtime, `[codex-oauth] provider bootstrap: after small=${afterSmall} large=${afterLarge}`);

        return {
          text: "",
          data: {
            enabled,
            before: { text_small: beforeSmall, text_large: beforeLarge },
            after: { text_small: afterSmall, text_large: afterLarge },
            messagePreview: String(message?.content?.text ?? "").slice(0, 80)
          },
        };
      },
    },
  ],

  actions: [
    {
      name: "codex_oauth_command_router",
      description: "Routes /codex commands (login/paste/status/logout).",
      validate: async (_runtime: any, message: any) => {
        const text = String(message?.content?.text ?? "");
        return /^\/codex(\s|$)/i.test(text);
      },
      handler: async (_runtime: any, message: any, _state: any, _options: any, callback: any) => {
        const text = String(message?.content?.text ?? "").trim();

        const send = async (t: string) => {
          if (typeof callback === "function") await callback({ text: t });
        };

        if (/^\/codex\s*$/i.test(text) || /^\/codex\s+help$/i.test(text)) {
          await send(helpText());
          return;
        }

        if (/^\/codex\s+status$/i.test(text)) {
          const tok = readCodexToken();
          await send(
            tok
              ? [
                  "Codex OAuth: configured",
                  `- oauthPath: ${resolveOAuthPath()}`,
                  `- access_token: ${mask(tok.access_token)}`,
                  `- refresh_token: ${mask(tok.refresh_token)}`,
                  `- expires_in: ${tok.expires_in}s`,
                  tok.obtained_at ? `- obtained_at: ${tok.obtained_at}` : "- obtained_at: (unknown)",
                ].join("\n")
              : [
                  "Codex OAuth: not configured",
                  `- oauthPath: ${resolveOAuthPath()}`,
                  "Run: /codex login",
                ].join("\n"),
          );
          return;
        }

        if (/^\/codex\s+logout$/i.test(text)) {
          deleteCodexToken();
          await send("Codex OAuth token removed.");
          return;
        }

        const paste = parseCodexPaste(text);
        if (paste) {
          const creds = await loginOpenAICodex({
            onAuth: async () => paste,
            onPrompt: async (msg: string) => {
              await send(msg);
              return "";
            },
            onProgress: async (msg: string) => {
              await send(msg);
            },
          });

          if (creds) {
            const token: CodexOAuthToken = {
              ...(creds as any),
              obtained_at: new Date().toISOString(),
            };
            writeCodexToken(token);
            await send("Codex OAuth complete.");
          } else {
            await send("Codex OAuth did not return credentials.");
          }
          return;
        }

        if (/^\/codex\s+login$/i.test(text)) {
          const port = Number(process.env.CODEX_OAUTH_CALLBACK_PORT ?? 1455);
          let redirectUrl: string | null = null;

          let closeServer: (() => Promise<void>) | null = null;
          try {
            const server = await startLocalCallbackServer({
              port,
              onRedirect: (url) => {
                redirectUrl = url;
              },
            });
            closeServer = server.close;
          } catch (err) {
            await send(
              `Could not start callback server on 127.0.0.1:${port} (${err instanceof Error ? err.message : String(err)}). You can still finish by pasting the redirect URL with /codex paste <url>.`,
            );
          }

          await send(
            [
              "Starting OpenAI Codex OAuth…",
              `- callback: http://127.0.0.1:${port}/auth/callback`,
              "If the callback doesn't auto-complete, paste the final redirect URL:",
              "  /codex paste <redirect_url>",
            ].join("\n"),
          );

          try {
            const creds = await loginOpenAICodex({
              onAuth: async () => redirectUrl ?? "",
              onPrompt: async (msg: string) => {
                await send(msg);
                return "";
              },
              onProgress: async (msg: string) => {
                await send(msg);
              },
            });

            if (creds) {
              const token: CodexOAuthToken = {
                ...(creds as any),
                obtained_at: new Date().toISOString(),
              };
              writeCodexToken(token);
              await send("Codex OAuth complete.");
            } else {
              await send("If OAuth didn't finish, use /codex paste <redirect_url>.");
            }
          } finally {
            if (closeServer) await closeServer();
          }
          return;
        }

        await send("Unknown /codex command.\n\n" + helpText());
      },
      examples: [],
    },
  ],
};

export default plugin;
