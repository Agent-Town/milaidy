import { test, expect, waitForAgentState, getAgentStatus, ensureAgentRunning } from "./fixtures.js";

test.describe("Agent Lifecycle", () => {
  test.describe.configure({ timeout: 120_000 });

  test("running after setup", async ({ appPage: page }) => {
    const s = await getAgentStatus(page);
    expect(s.state).toBe("running");
    expect(s.agentName.length).toBeGreaterThan(0);
  });

  test("stop → stopped", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    expect((await page.request.post("/api/agent/stop")).status()).toBe(200);
    await waitForAgentState(page, "stopped", 30_000);
    await page.request.post("/api/agent/start");
    await waitForAgentState(page, "running", 120_000);
  });

  test("start → running", async ({ appPage: page }) => {
    await page.request.post("/api/agent/stop");
    await waitForAgentState(page, "stopped", 30_000);
    expect((await page.request.post("/api/agent/start")).status()).toBe(200);
    await waitForAgentState(page, "running", 120_000);
  });

  test("pause → resume", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    expect((await page.request.post("/api/agent/pause")).status()).toBe(200);
    await waitForAgentState(page, "paused", 30_000);
    expect((await page.request.post("/api/agent/resume")).status()).toBe(200);
    await waitForAgentState(page, "running", 30_000);
  });

  test("restart resets startedAt", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    const before = (await (await page.request.get("/api/status")).json()) as { agentName: string; startedAt?: number };
    expect((await page.request.post("/api/agent/restart")).status()).toBe(200);
    await waitForAgentState(page, "running", 120_000);
    const after = (await (await page.request.get("/api/status")).json()) as { agentName: string; startedAt?: number };
    expect(after.agentName).toBe(before.agentName);
    if (after.startedAt && before.startedAt) expect(after.startedAt).toBeGreaterThanOrEqual(before.startedAt);
  });

  test("name matches character API", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    const { agentName } = await getAgentStatus(page);
    const { character } = (await (await page.request.get("/api/character")).json()) as { character: { name: string } };
    expect(agentName).toBe(character.name);
  });
});
