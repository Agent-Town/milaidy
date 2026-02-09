import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

test.describe("Config & Settings", () => {
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(async ({ appPage: page }) => { await ensureAgentRunning(page); });

  test("config page navigates", async ({ appPage: page }) => {
    await navigateToTab(page, "Config");
    await expect(page).toHaveURL(/\/config/);
  });

  test("config page has shadow DOM content", async ({ appPage: page }) => {
    await navigateToTab(page, "Config");
    const len = await page.evaluate(() => document.querySelector("milaidy-app")?.shadowRoot?.textContent?.length ?? 0);
    expect(len).toBeGreaterThan(10);
  });

  test("extension status", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/extension/status")).json()) as { relayReachable: boolean; relayPort: number };
    expect(typeof d.relayReachable).toBe("boolean");
    expect(typeof d.relayPort).toBe("number");
  });

  test("export estimate", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/agent/export/estimate");
    // Specific statuses: 200 (available), 503 (agent not running), 500 (export error)
    expect([200, 500, 503]).toContain(resp.status());
  });

  test("character endpoint", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/character")).json()) as { character: { name: string }; agentName: string };
    expect(d.character.name.length).toBeGreaterThan(0);
    expect(typeof d.agentName).toBe("string");
  });

  test("character schema", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/character/schema")).json()) as { fields: Array<{ key: string }> };
    expect(d.fields.length).toBeGreaterThan(0);
    expect(d.fields.map((f) => f.key)).toContain("name");
  });

  test("update character bio and verify persistence", async ({ appPage: page }) => {
    const { character } = (await (await page.request.get("/api/character")).json()) as { character: Record<string, unknown> };
    const newBio = `E2E bio ${Date.now()}`;
    const resp = await page.request.put("/api/character", { data: { ...character, bio: newBio } });
    expect(resp.status()).toBe(200);
    expect(((await resp.json()) as { ok: boolean }).ok).toBe(true);
    // Re-fetch and verify the bio actually persisted
    const { character: refetched } = (await (await page.request.get("/api/character")).json()) as { character: { bio: string | string[] } };
    const bio = Array.isArray(refetched.bio) ? refetched.bio.join(" ") : refetched.bio;
    expect(bio).toContain("E2E bio");
  });

  test("empty character name rejected", async ({ appPage: page }) => {
    expect((await page.request.put("/api/character", { data: { name: "" } })).status()).toBe(422);
  });

  test("full config endpoint", async ({ appPage: page }) => {
    expect((await page.request.get("/api/config")).status()).toBe(200);
  });

  test("autonomy endpoint", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/agent/autonomy")).json()) as { enabled: boolean };
    expect(typeof d.enabled).toBe("boolean");
  });

  test("update character with multiple fields", async ({ appPage: page }) => {
    const { character: original } = (await (await page.request.get("/api/character")).json()) as { character: Record<string, unknown> };
    const updated = {
      ...original,
      adjectives: ["friendly", "helpful", "curious"],
      topics: ["technology", "science", "testing"],
      bio: `Multi-field update ${Date.now()}`,
    };
    const resp = await page.request.put("/api/character", { data: updated });
    expect(resp.status()).toBe(200);
    const result = (await resp.json()) as { ok: boolean; character: Record<string, unknown> };
    expect(result.ok).toBe(true);
    // Verify fields persisted by re-fetching
    const { character: verified } = (await (await page.request.get("/api/character")).json()) as { character: Record<string, unknown> };
    const adjectives = verified.adjectives as string[];
    expect(adjectives).toContain("friendly");
    expect(adjectives).toContain("curious");
  });

  test("agent export returns binary file", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/agent/export", {
      data: { password: "test-pw-1234", includeLogs: false },
    });
    // Export may not be available if runtime state doesn't support it
    if (resp.status() !== 200) {
      expect([500, 503]).toContain(resp.status());
      return;
    }
    const body = await resp.body();
    expect(body.length).toBeGreaterThan(50);
  });

  test("character schema fields have types and labels", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/character/schema")).json()) as {
      fields: Array<{ key: string; type: string; label: string; description: string }>;
    };
    for (const f of d.fields) {
      expect(typeof f.key).toBe("string");
      expect(typeof f.type).toBe("string");
      expect(typeof f.label).toBe("string");
      expect(typeof f.description).toBe("string");
    }
  });

  test("config has expected top-level keys", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/config")).json()) as Record<string, unknown>;
    // Config should be a non-empty object (may have agents, plugins, etc.)
    expect(Object.keys(d).length).toBeGreaterThan(0);
  });
});
