import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

interface Goal { id: string; name: string; isCompleted: boolean }
interface Overview { goals: Goal[]; summary: Record<string, number>; autonomy: { enabled: boolean } }

test.describe("Goals", () => {
  test.beforeEach(async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    await navigateToTab(page, "Workbench");
    await page.waitForTimeout(500);
  });

  test("overview is consistent", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/workbench/overview")).json()) as Overview;
    expect(d.summary.goalCount).toBe(d.goals.length);
    expect(typeof d.autonomy.enabled).toBe("boolean");
  });

  test("create returns valid UUID", async ({ appPage: page }) => {
    const name = `Goal ${Date.now()}`;
    const body = (await (await page.request.post("/api/workbench/goals", { data: { name, description: "test" } })).json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect((await (await page.request.get("/api/workbench/overview")).json() as Overview).goals.find((g) => g.id === body.id)?.name).toBe(name);
  });

  test("persists", async ({ appPage: page }) => {
    const { id } = (await (await page.request.post("/api/workbench/goals", { data: { name: `P ${Date.now()}` } })).json()) as { id: string };
    expect((await (await page.request.get("/api/workbench/overview")).json() as Overview).goals.some((g) => g.id === id)).toBe(true);
  });

  test("mark complete", async ({ appPage: page }) => {
    const { id } = (await (await page.request.post("/api/workbench/goals", { data: { name: `C ${Date.now()}` } })).json()) as { id: string };
    expect((await page.request.patch(`/api/workbench/goals/${id}`, { data: { isCompleted: true } })).status()).toBe(200);
    expect((await (await page.request.get("/api/workbench/overview")).json() as Overview).goals.find((g) => g.id === id)?.isCompleted).toBe(true);
  });

  test("edit name", async ({ appPage: page }) => {
    const { id } = (await (await page.request.post("/api/workbench/goals", { data: { name: `O ${Date.now()}` } })).json()) as { id: string };
    const newName = `R ${Date.now()}`;
    expect((await page.request.patch(`/api/workbench/goals/${id}`, { data: { name: newName } })).status()).toBe(200);
    expect((await (await page.request.get("/api/workbench/overview")).json() as Overview).goals.find((g) => g.id === id)?.name).toBe(newName);
  });

  test("summary increments", async ({ appPage: page }) => {
    const before = (await (await page.request.get("/api/workbench/overview")).json() as Overview).summary.goalCount;
    await page.request.post("/api/workbench/goals", { data: { name: `S ${Date.now()}` } });
    expect((await (await page.request.get("/api/workbench/overview")).json() as Overview).summary.goalCount).toBe(before + 1);
  });

  test("empty name rejected", async ({ appPage: page }) => {
    expect((await page.request.post("/api/workbench/goals", { data: { name: "" } })).status()).toBeGreaterThanOrEqual(400);
  });

  test("empty PATCH rejected", async ({ appPage: page }) => {
    const { id } = (await (await page.request.post("/api/workbench/goals", { data: { name: `EP ${Date.now()}` } })).json()) as { id: string };
    expect((await page.request.patch(`/api/workbench/goals/${id}`, { data: {} })).status()).toBeGreaterThanOrEqual(400);
  });

  test("special characters in name", async ({ appPage: page }) => {
    for (const name of [`🎯 ${Date.now()}`, `<b>html</b> ${Date.now()}`, `中文 ${Date.now()}`, `"quotes" ${Date.now()}`]) {
      const { id } = (await (await page.request.post("/api/workbench/goals", { data: { name } })).json()) as { id: string };
      expect((await (await page.request.get("/api/workbench/overview")).json() as Overview).goals.find((g) => g.id === id)?.name).toBe(name);
    }
  });

  test("1000-char name", async ({ appPage: page }) => {
    expect([200, 400, 422]).toContain((await page.request.post("/api/workbench/goals", { data: { name: "A".repeat(1000) } })).status());
  });

  test("5 concurrent creates → unique IDs", async ({ appPage: page }) => {
    const ids = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      page.request.post("/api/workbench/goals", { data: { name: `C${i} ${Date.now()}` } }).then(async (r) => ((await r.json()) as { id: string }).id),
    ));
    expect(new Set(ids).size).toBe(5);
  });

  test("tags and priority", async ({ appPage: page }) => {
    const { id } = (await (await page.request.post("/api/workbench/goals", { data: { name: `T ${Date.now()}`, tags: ["e2e"], priority: 1 } })).json()) as { id: string };
    expect(id).toBeTruthy();
  });
});
