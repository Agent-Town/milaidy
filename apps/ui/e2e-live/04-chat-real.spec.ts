import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

test.describe("Chat", () => {
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(async ({ appPage: page }) => { await ensureAgentRunning(page); });

  test("responds with real text", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/chat", { data: { text: "Say pineapple." } });
    expect(resp.status()).toBe(200);
    const data = (await resp.json()) as { text: string; agentName: string };
    expect(data.text.length).toBeGreaterThan(2);
    expect(data.text).toMatch(/[a-zA-Z]{3,}/);
    expect(data.agentName.length).toBeGreaterThan(0);
  });

  test("answers 2+2 = 4", async ({ appPage: page }) => {
    const { text } = (await (await page.request.post("/api/chat", { data: { text: "What is 2 + 2? Reply with just the number." } })).json()) as { text: string };
    expect(text.toLowerCase()).toMatch(/\b4\b|\bfour\b/);
    expect(text.toLowerCase()).not.toContain("error");
  });

  test("rejects empty message", async ({ appPage: page }) => {
    expect((await page.request.post("/api/chat", { data: { text: "" } })).status()).toBeGreaterThanOrEqual(400);
  });

  test("stopped agent", async ({ appPage: page }) => {
    await page.request.post("/api/agent/stop");
    await page.waitForTimeout(2000);
    const resp = await page.request.post("/api/chat", { data: { text: "Hello" } });
    const status = resp.status();
    const body = (await resp.json()) as { text?: string; error?: string };
    if (status === 503) expect(body.error).toBeTruthy();
    else if (status === 200) expect(typeof body.text).toBe("string");
    else expect(status).toBe(500);
    await page.request.post("/api/agent/start");
    await page.waitForTimeout(5000);
  });

  test("chat UI has input in shadow DOM", async ({ appPage: page }) => {
    await navigateToTab(page, "Chat");
    const hasInput = await page.evaluate(() => {
      const sr = document.querySelector("milaidy-app")?.shadowRoot;
      return sr?.querySelector("textarea") !== null || [...(sr?.querySelectorAll("button") ?? [])].some((b) => /send/i.test(b.textContent ?? ""));
    });
    expect(hasInput).toBe(true);
  });

  test("response includes agentName", async ({ appPage: page }) => {
    const { agentName } = (await (await page.request.post("/api/chat", { data: { text: "Hello" } })).json()) as { agentName: string };
    expect(agentName.length).toBeGreaterThan(0);
  });
});
