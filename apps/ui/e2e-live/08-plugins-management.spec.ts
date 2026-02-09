import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

interface Plugin { id: string; name: string; description: string; enabled: boolean; category: string; isCore?: boolean; validationErrors: Array<{ field: string; message: string }>; validationWarnings: Array<{ field: string; message: string }> }

test.describe("Plugin Management", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    await navigateToTab(page, "Plugins");
    await page.waitForTimeout(500);
  });

  async function getPlugins(page: import("@playwright/test").Page): Promise<Plugin[]> {
    return ((await (await page.request.get("/api/plugins")).json()) as { plugins: Plugin[] }).plugins;
  }

  test("plugin list loads", async ({ appPage: page }) => {
    const plugins = await getPlugins(page);
    expect(plugins.length).toBeGreaterThan(0);
  });

  test("each plugin has expected shape", async ({ appPage: page }) => {
    for (const p of await getPlugins(page)) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.name).toBe("string");
      expect(typeof p.enabled).toBe("boolean");
      expect(["ai-provider", "connector", "database", "feature"]).toContain(p.category);
      expect(Array.isArray(p.validationErrors)).toBe(true);
      expect(Array.isArray(p.validationWarnings)).toBe(true);
    }
  });

  test("plugin name appears in shadow DOM", async ({ appPage: page }) => {
    const [first] = await getPlugins(page);
    const found = await page.evaluate((name: string) => {
      const sr = document.querySelector("milaidy-app")?.shadowRoot;
      return sr?.textContent?.includes(name) ?? false;
    }, first.name);
    expect(found).toBe(true);
  });

  test("toggle plugin enable state", async ({ appPage: page }) => {
    const plugins = await getPlugins(page);
    const target = plugins.find((p) => !p.isCore && (p.category === "feature" || p.category === "connector"));
    if (!target) { test.skip(true, "No toggleable plugin"); return; }

    const resp = await page.request.put(`/api/plugins/${target.id}`, { data: { enabled: !target.enabled } });
    // 500 is a real bug — fail, don't skip
    expect(resp.status()).toBe(200);
    await page.waitForTimeout(2000);

    const updated = (await getPlugins(page)).find((p) => p.id === target.id);
    expect(updated?.enabled).toBe(!target.enabled);

    // Restore
    await page.request.put(`/api/plugins/${target.id}`, { data: { enabled: target.enabled } });
    await page.waitForTimeout(2000);
  });

  test("plugin state roundtrips", async ({ appPage: page }) => {
    const [target] = await getPlugins(page);
    await page.request.put(`/api/plugins/${target.id}`, { data: { enabled: !target.enabled } });
    await page.request.put(`/api/plugins/${target.id}`, { data: { enabled: target.enabled } });
    const restored = (await getPlugins(page)).find((p) => p.id === target.id);
    expect(restored?.enabled).toBe(target.enabled);
  });

  test("installed plugins endpoint", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/plugins/installed");
    expect(resp.status()).toBe(200);
    const d = (await resp.json()) as { count: number; plugins: unknown[] };
    expect(typeof d.count).toBe("number");
  });
});
