import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect } from "vitest";
import {
  AgentRuntime,
  ChannelType,
  createCharacter,
  createMessageMemory,
  stringToUuid,
  type UUID,
  logger,
  type Plugin,
} from "@elizaos/core";

// Minimal repro: personality plugin calls runtime.useModel(TEXT_SMALL) during evaluators.
// We want to ensure our Codex OAuth bootstrap supplies TEXT_SMALL even when no default LLM provider is loaded.

describe("Codex OAuth + personality (E2E)", () => {
  it("does not throw 'No handler found for delegate type: TEXT_SMALL' during message handling", async () => {
    // Simulate "user ran the script first": provide creds at the expected path.
    const testHome = fs.mkdtempSync(path.join(os.tmpdir(), "milaidy-test-home-"));
    process.env.HOME = testHome;
    process.env.OPENAI_CODEX_OAUTH = "true";

    const oauthPath = path.join(testHome, ".milaidy", "credentials", "oauth.json");
    fs.mkdirSync(path.dirname(oauthPath), { recursive: true });
    // NOTE: structure must match readCodexCreds() expectations in storage-codex.ts
    fs.writeFileSync(
      oauthPath,
      JSON.stringify(
        {
          "openai-codex": {
            access: "test-access-token",
            refresh: "test-refresh-token",
            expires: Date.now() + 60 * 60 * 1000,
            obtained_at: new Date().toISOString(),
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const roomId = stringToUuid("test-codex-oauth-room");
    const userId = crypto.randomUUID() as UUID;

    const character = createCharacter({
      name: "TestAgent",
      bio: "test",
      secrets: {},
    });

    const plugins: Plugin[] = [];

    const sqlMod = (await import("@elizaos/plugin-sql")) as any;
    const sql = sqlMod?.default ?? sqlMod?.plugin ?? sqlMod;
    expect(sql?.name).toBeTruthy();
    plugins.push(sql);

    const personalityMod = (await import("@elizaos/plugin-personality")) as any;
    const personality = personalityMod?.default ?? personalityMod?.selfModificationPlugin ?? personalityMod?.plugin ?? personalityMod;
    expect(personality?.name).toBeTruthy();
    plugins.push(personality);

    // Load our plugin from the local plugin workspace
    const codexMod = (await import("../plugins/plugin-openai-codex-oauth/typescript/dist/index.js")) as any;
    const codex = codexMod?.default ?? codexMod?.plugin ?? codexMod;
    expect(codex?.name).toBeTruthy();
    plugins.push(codex);

    const runtime = new AgentRuntime({
      character,
      plugins,
      logLevel: "info",
      enableAutonomy: false,
    });

    await runtime.initialize();
    await runtime.ensureConnection({
      entityId: userId,
      roomId,
      worldId: stringToUuid("test-world"),
      userName: "TestUser",
      source: "test",
      channelId: "test-channel",
      type: ChannelType.DM,
    });

    const msg = createMessageMemory({
      id: crypto.randomUUID() as UUID,
      entityId: userId,
      roomId,
      content: {
        text: "hello",
        source: "test",
        channelType: ChannelType.DM,
      },
    });

    let thrown: unknown = null;
    try {
      await runtime.messageService!.handleMessage(runtime, msg, async () => []);
    } catch (err) {
      thrown = err;
      logger.warn(`[e2e] handleMessage threw: ${err instanceof Error ? err.message : String(err)}`);
    }

    expect(thrown, "handleMessage should not throw").toBeNull();

    // Hard requirement: TEXT_SMALL must be available (this was the production crash).
    // If it isn't registered, we regress the bootstrap.
    const hasSmall = Boolean(runtime.models.get("TEXT_SMALL")?.length);
    expect(hasSmall, "TEXT_SMALL should be registered").toBe(true);
  }, 120_000);
});
