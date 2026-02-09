import { test, expect, waitForApp, getAppText } from "./fixtures.js";

test.describe("Theme", () => {
  test("app renders with content in shadow DOM", async ({ appPage: page }) => {
    const text = await getAppText(page);
    expect(text.length).toBeGreaterThan(0);
  });

  test("app has styles applied", async ({ appPage: page }) => {
    const hasStyles = await page.evaluate(() => {
      const app = document.querySelector("milaidy-app");
      if (!app || !app.shadowRoot) return false;
      // Check for adopted stylesheets, inline styles, or style elements
      const adopted = (app.shadowRoot as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets;
      const styleElements = app.shadowRoot.querySelectorAll("style");
      return (adopted !== undefined && adopted.length > 0) || styleElements.length > 0;
    });
    expect(hasStyles).toBe(true);
  });

  test("app persists content across reload", async ({ appPage: page }) => {
    const before = await getAppText(page);
    expect(before.length).toBeGreaterThan(0);

    await page.reload();
    await waitForApp(page);

    const after = await getAppText(page);
    expect(after.length).toBeGreaterThan(0);
  });
});
