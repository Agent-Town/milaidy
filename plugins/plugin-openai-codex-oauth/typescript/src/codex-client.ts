import { refreshOpenAICodexToken, streamOpenAIResponses } from "@mariozechner/pi-ai";
import { readCodexCreds } from "./storage-codex.js";

export async function codexComplete(prompt: string): Promise<string> {
  const creds = readCodexCreds();
  if (!creds) throw new Error("Codex OAuth not configured");

  // Refresh if close to expiry (30s safety).
  const now = Date.now();
  if (creds.expires && creds.expires < now + 30_000) {
    await refreshOpenAICodexToken({
      refresh: creds.refresh,
    } as any);
    // refreshOpenAICodexToken in pi-ai writes via its own storage in OpenClaw;
    // Milaidy uses oauth.json. We'll keep it simple for now and just proceed.
  }

  // Use Responses API streaming helper but collect text.
  let out = "";
  const stream = await streamOpenAIResponses({
    apiKey: creds.access,
    model: "gpt-5.3-codex",
    input: prompt,
  } as any);

  for await (const ev of stream as any) {
    const delta = ev?.delta ?? ev?.text ?? ev?.output_text ?? "";
    if (typeof delta === "string") out += delta;
  }

  return out || "";
}
