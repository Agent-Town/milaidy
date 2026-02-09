import { test, expect, waitForApp, waitForAgentState } from "./fixtures.js";

test.describe("Onboarding Wizard", () => {
  test.describe.configure({ timeout: 180_000 });

  test("reset returns to onboarding state", async ({ page }) => {
    expect((await page.request.post("/api/agent/reset")).status()).toBe(200);
    const d = (await (await page.request.get("/api/onboarding/status")).json()) as { complete: boolean };
    expect(d.complete).toBe(false);
  });

  test("full wizard completes and starts agent", async ({ page }) => {
    const { complete } = (await (await page.request.get("/api/onboarding/status")).json()) as { complete: boolean };
    if (complete) {
      await page.request.post("/api/agent/reset");
      await page.waitForTimeout(2000);
    }

    await page.goto("/");
    await waitForApp(page);

    // Walk through wizard steps (each step uses best-effort selectors)
    const clickIf = async (selector: string) => {
      const loc = page.locator(selector);
      if ((await loc.count()) > 0) { await loc.first().click(); await page.waitForTimeout(400); }
    };

    // Welcome → Continue
    await clickIf("button:has-text('continue'), button:has-text('get started'), button:has-text('begin')");
    // Name — click a preset or fill input
    const nameInput = page.locator("input[placeholder*='name' i], input[placeholder*='agent' i]");
    if ((await nameInput.count()) > 0) await nameInput.first().fill("Reimu");
    else await clickIf("button:has-text(/^[A-Z][a-z]+$/)");
    await clickIf("button:has-text('continue'), button:has-text('next')");
    // Style
    await clickIf("[class*='style'] button, [class*='preset'] button");
    await clickIf("button:has-text('continue'), button:has-text('next')");
    // Theme
    await clickIf("button:has-text('dark')");
    await clickIf("button:has-text('continue'), button:has-text('next')");
    // Run mode
    await clickIf("button:has-text('local')");
    await clickIf("button:has-text('continue'), button:has-text('next')");
    // Provider
    await clickIf("button:has-text('anthropic'), button:has-text('openai')");
    // API key
    const keyInput = page.locator("input[type='password'], input[placeholder*='key' i], input[placeholder*='sk-' i]");
    if ((await keyInput.count()) > 0) {
      await keyInput.first().fill(process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? "");
    }
    await clickIf("button:has-text('continue'), button:has-text('next')");
    // Skip optional steps
    await clickIf("button:has-text('skip'), button:has-text('later')");
    await clickIf("button:has-text('skip'), button:has-text('later'), button:has-text('finish')");
    // Finish
    await clickIf("button:has-text('finish'), button:has-text('start'), button:has-text('launch'), button:has-text('done')");

    await page.waitForTimeout(5000);

    const d = (await (await page.request.get("/api/onboarding/status")).json()) as { complete: boolean };
    expect(d.complete).toBe(true);

    await waitForAgentState(page, "running", 120_000);
    await page.goto("/");
    await waitForApp(page);
    const nav = page.locator("nav");
    await expect(nav).toBeVisible({ timeout: 30_000 });
  });
});
