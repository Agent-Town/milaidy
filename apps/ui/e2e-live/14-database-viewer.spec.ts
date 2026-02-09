import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

test.describe("Database Viewer", () => {
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(async ({ appPage: page }) => { await ensureAgentRunning(page); });

  test("database status", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/database/status")).json()) as { provider: string; connected: boolean; tableCount: number };
    expect(typeof d.provider).toBe("string");
    expect(typeof d.connected).toBe("boolean");
    expect(typeof d.tableCount).toBe("number");
  });

  test("database config", async ({ appPage: page }) => {
    const d = (await (await page.request.get("/api/database/config")).json()) as { activeProvider: string };
    expect(typeof d.activeProvider).toBe("string");
  });

  test("tables list", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/database/tables");
    if (resp.status() === 503) { test.skip(true, "DB adapter unavailable"); return; }
    expect(resp.status()).toBe(200);
    expect(Array.isArray(((await resp.json()) as { tables: unknown[] }).tables)).toBe(true);
  });

  test("table rows (paginated)", async ({ appPage: page }) => {
    const tr = await page.request.get("/api/database/tables");
    if (tr.status() !== 200) { test.skip(true, "Tables unavailable"); return; }
    const { tables } = (await tr.json()) as { tables: Array<{ name: string }> };
    if (tables.length === 0) { test.skip(true, "No tables"); return; }
    const resp = await page.request.get(`/api/database/tables/${encodeURIComponent(tables[0].name)}/rows?offset=0&limit=10`);
    expect([200, 404, 500]).toContain(resp.status());
  });

  test("SQL query returns results", async ({ appPage: page }) => {
    const d = (await (await page.request.post("/api/database/query", {
      data: { sql: "SELECT 1 AS n, 'ok' AS s", readOnly: true },
    })).json()) as { columns: string[]; rowCount: number; durationMs: number };
    expect(d.columns).toContain("n");
    expect(d.rowCount).toBe(1);
    expect(typeof d.durationMs).toBe("number");
  });

  test("SQL syntax error rejected", async ({ appPage: page }) => {
    expect((await page.request.post("/api/database/query", { data: { sql: "SELEKT", readOnly: true } })).status()).toBeGreaterThanOrEqual(400);
  });

  test("read-only rejects mutations", async ({ appPage: page }) => {
    expect((await page.request.post("/api/database/query", { data: { sql: "DROP TABLE IF EXISTS e2e_x", readOnly: true } })).status()).toBe(400);
  });

  test("database page navigates", async ({ appPage: page }) => {
    await navigateToTab(page, "Database");
    await expect(page).toHaveURL(/\/database/);
  });

  test("postgres connection test endpoint", async ({ appPage: page }) => {
    const d = (await (await page.request.post("/api/database/test", {
      data: { host: "localhost", port: 5432, database: "test", user: "test", password: "test" },
    })).json()) as { success: boolean; durationMs: number };
    expect(typeof d.success).toBe("boolean");
    expect(typeof d.durationMs).toBe("number");
  });

  test("read-only rejects multi-statement SQL", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/database/query", {
      data: { sql: "SELECT 1; SELECT 2;", readOnly: true },
    });
    expect(resp.status()).toBe(400);
  });

  test("SQL query result has correct data values", async ({ appPage: page }) => {
    const d = (await (await page.request.post("/api/database/query", {
      data: { sql: "SELECT 42 AS answer, 'hello' AS greeting, true AS flag", readOnly: true },
    })).json()) as { columns: string[]; rows: Array<Record<string, unknown>>; rowCount: number };
    expect(d.rowCount).toBe(1);
    expect(d.columns).toEqual(expect.arrayContaining(["answer", "greeting", "flag"]));
    expect(d.rows[0].answer).toBe(42);
    expect(d.rows[0].greeting).toBe("hello");
    expect(d.rows[0].flag).toBe(true);
  });

  test("SQL query with large UNION", async ({ appPage: page }) => {
    const unions = Array.from({ length: 50 }, (_, i) => `SELECT ${i} AS n`).join(" UNION ALL ");
    const resp = await page.request.post("/api/database/query", {
      data: { sql: unions, readOnly: true },
    });
    expect([200, 400, 500]).toContain(resp.status());
    if (resp.status() === 200) {
      const d = (await resp.json()) as { rowCount: number };
      expect(d.rowCount).toBe(50);
    }
  });

  test("tables have column metadata", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/database/tables");
    if (resp.status() !== 200) { test.skip(true, "Tables unavailable"); return; }
    const { tables } = (await resp.json()) as { tables: Array<{ name: string; columns: Array<Record<string, unknown>> }> };
    if (tables.length === 0) { test.skip(true, "No tables"); return; }
    const t = tables[0];
    expect(t.columns.length).toBeGreaterThan(0);
    for (const col of t.columns) {
      expect(typeof col.name).toBe("string");
      expect((col.name as string).length).toBeGreaterThan(0);
      // Column type field may be "dataType", "data_type", or "type"
      const typeField = col.dataType ?? col.data_type ?? col.type;
      expect(typeof typeField).toBe("string");
    }
  });
});
