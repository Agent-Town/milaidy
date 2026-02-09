import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

interface LogEntry { timestamp: number; level: string; message: string; source: string }

test.describe("Logs", () => {
  test.beforeEach(async ({ appPage: page }) => { await ensureAgentRunning(page); });

  test("logs page navigates", async ({ appPage: page }) => {
    await navigateToTab(page, "Logs");
    await expect(page).toHaveURL(/\/logs/);
  });

  test("logs API returns structured entries", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/logs")).json()) as { entries: LogEntry[]; sources: string[] };
    expect(Array.isArray(d.entries)).toBe(true);
    expect(Array.isArray(d.sources)).toBe(true);
    if (d.entries.length > 0) {
      const e = d.entries[0];
      expect(typeof e.timestamp).toBe("number");
      expect(typeof e.level).toBe("string");
      expect(typeof e.message).toBe("string");
    }
  });

  test("log filtering by source", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/logs")).json()) as { sources: string[] };
    if (d.sources.length === 0) { test.skip(true, "No sources"); return; }
    const filtered = (await (await page.request.get(`/api/logs?source=${encodeURIComponent(d.sources[0])}`)).json()) as { entries: LogEntry[] };
    for (const e of filtered.entries) expect(e.source).toBe(d.sources[0]);
  });
});
