import { ModelType } from "@elizaos/core";

import { readCodexCreds, resolveOAuthPath } from "./storage-codex.js";

export type RuntimeLike = {
  models?: { get: (k: string) => any[] | undefined };
  registerModel?: (modelType: string, handler: any, provider?: string, priority?: number) => void;
  useModel?: (modelType: string, params: any) => Promise<any>;
  logger?: { info?: (...args: any[]) => void; warn?: (...args: any[]) => void; debug?: (...args: any[]) => void; trace?: (...args: any[]) => void };
};

export function hasModelKey(runtime: RuntimeLike, key: string): boolean {
  try {
    return Boolean(runtime?.models?.get?.(key)?.length);
  } catch {
    return false;
  }
}

export function registerTextDelegateIfMissing(runtime: RuntimeLike, key: string) {
  if (hasModelKey(runtime, key)) return;
  if (typeof runtime?.registerModel !== "function") return;

  const handler = async (_rt: any, params: any) => {
    const creds = readCodexCreds();
    if (creds?.access) {
      try {
        const { generateWithCodex } = await import("./codex-generate.js");
        return await generateWithCodex(params);
      } catch {
        // Fallback to deterministic stub if Codex is unavailable.
      }
    }
    const { stubText } = await import("./stub.js");
    return await stubText(params);
  };

  runtime.registerModel(key, handler, "openai-codex-oauth", 0);
}

export async function initCodexOAuthTextDelegates(runtime: RuntimeLike): Promise<{ enabled: boolean; registered: string[] }> {
  const creds = readCodexCreds();
  const enabled = Boolean(creds?.access);
  if (!enabled) {
    // If user enabled the plugin but hasn't run OAuth yet, tell them exactly what to do.
    // (We intentionally do not register stub models in this mode.)
    try {
      const flag = String(process.env.OPENAI_CODEX_OAUTH ?? "");
      const wants = flag === "true" || flag === "1" || flag === "yes";
      if (wants) {
        runtime?.logger?.warn?.(
          `[codex-oauth] OpenAI Codex OAuth is enabled but no credentials were found at ${resolveOAuthPath()}. Run: node scripts/codex-login.mjs (from plugins/plugin-openai-codex-oauth/) to generate oauth.json, then restart Milaidy.`,
        );
      }
    } catch {
      // ignore logging failures
    }
    return { enabled, registered: [] };
  }

  const keySmall = String(ModelType.TEXT_SMALL);
  const keyLarge = String(ModelType.TEXT_LARGE);

  const registered: string[] = [];
  if (!hasModelKey(runtime, keySmall)) {
    registerTextDelegateIfMissing(runtime, keySmall);
    registered.push(keySmall);
  }
  if (!hasModelKey(runtime, keyLarge)) {
    registerTextDelegateIfMissing(runtime, keyLarge);
    registered.push(keyLarge);
  }

  return { enabled, registered };
}
