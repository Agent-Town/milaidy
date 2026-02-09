import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

interface Skill { id: string; name: string; enabled: boolean }

test.describe("Skills", () => {
  test.beforeEach(async ({ appPage: page }) => { await ensureAgentRunning(page); await navigateToTab(page, "Skills"); });

  async function getSkills(page: import("@playwright/test").Page): Promise<Skill[]> {
    return ((await (await page.request.get("/api/skills")).json()) as { skills: Skill[] }).skills;
  }

  test("skills list loads with required fields", async ({ appPage: page }) => {
    const skills = await getSkills(page);
    expect(Array.isArray(skills)).toBe(true);
    for (const s of skills) {
      expect(typeof s.id).toBe("string");
      expect(s.id.length).toBeGreaterThan(0);
      expect(typeof s.name).toBe("string");
      expect(s.name.length).toBeGreaterThan(0);
      expect(typeof s.enabled).toBe("boolean");
    }
  });

  test("toggle skill enable/disable", async ({ appPage: page }) => {
    const skills = await getSkills(page);
    if (skills.length === 0) { test.skip(true, "No skills loaded"); return; }
    const t = skills[0];
    expect((await page.request.put(`/api/skills/${encodeURIComponent(t.id)}`, { data: { enabled: !t.enabled } })).status()).toBe(200);
    expect((await getSkills(page)).find((s) => s.id === t.id)?.enabled).toBe(!t.enabled);
    // Restore
    await page.request.put(`/api/skills/${encodeURIComponent(t.id)}`, { data: { enabled: t.enabled } });
  });

  test("refresh reloads skills", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/skills/refresh");
    expect(resp.status()).toBe(200);
    expect(((await resp.json()) as { ok: boolean }).ok).toBe(true);
  });

  test("skill enable persists", async ({ appPage: page }) => {
    const skills = await getSkills(page);
    if (skills.length === 0) { test.skip(true, "No skills"); return; }
    const t = skills[0];
    await page.request.put(`/api/skills/${encodeURIComponent(t.id)}`, { data: { enabled: !t.enabled } });
    // Re-fetch to verify
    expect((await getSkills(page)).find((s) => s.id === t.id)?.enabled).toBe(!t.enabled);
    // Restore
    await page.request.put(`/api/skills/${encodeURIComponent(t.id)}`, { data: { enabled: t.enabled } });
  });
});
