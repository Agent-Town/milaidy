import { getModels } from "@mariozechner/pi-ai";
import { streamOpenAICodexResponses } from "@mariozechner/pi-ai/dist/providers/openai-codex-responses.js";

import { readCodexCreds } from "./storage-codex.js";

function isCodexErrorEvent(ev: any): string | null {
  if (!ev) return null;
  if (ev.type === "error" && ev.error?.errorMessage) return String(ev.error.errorMessage);
  if (ev.type === "error" && ev.error?.message) return String(ev.error.message);
  return null;
}

async function collectTextOrThrow(stream: any): Promise<string> {
  let out = "";
  for await (const ev of stream) {
    const err = isCodexErrorEvent(ev);
    if (err) throw new Error(`Codex error: ${err}`);

    const msg = ev?.message ?? ev?.partial;
    const content = msg?.content;

    if (Array.isArray(content)) {
      const t = content.map((c: any) => c?.text).filter(Boolean).join("");
      if (t) out = t;
    }

    if (typeof msg?.text === "string" && msg.text) out = msg.text;
  }
  return out;
}

export async function generateWithCodex(params: any): Promise<string> {
  const creds = readCodexCreds();
  if (!creds?.access || !creds?.accountId) throw new Error("Codex OAuth not configured");

  const prompt = String(params?.prompt ?? "");

  const providerModels = await getModels("openai-codex");
  const modelId = process.env.CODEX_OAUTH_MODEL ?? "gpt-5.2-codex";
  const model = providerModels.find((m) => m.id === modelId) ?? providerModels[0];
  if (!model) throw new Error("No openai-codex models available");

  const ctx = {
    systemPrompt: "",
    messages: [{ role: "user", content: prompt }],
  } as any;

  const stream = streamOpenAICodexResponses(model as any, ctx, {
    apiKey: creds.access,
    accountId: creds.accountId,
    // NOTE: do not pass temperature (backend rejects it)
  } as any);

  const text = await collectTextOrThrow(stream as any);
  // Never return empty string: downstream format parsers interpret this as truncation.
  if (!text || !text.trim()) throw new Error("Codex returned empty output");
  return text;
}
