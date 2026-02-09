import { test, expect, getAppText } from "./fixtures.js";

test.describe("Command Palette", () => {
  test("Cmd+K button exists in the header", async ({ appPage: page }) => {
    // The header has a "Cmd+K" button that triggers openCommandPalette()
    const text = await getAppText(page);
    expect(text).toContain("Cmd+K");
  });

  test("command palette state is initially closed", async ({ appPage: page }) => {
    // The commandPaletteOpen state should be false initially
    const paletteOpen = await page.evaluate(() => {
      const app = document.querySelector("milaidy-app") as HTMLElement & {
        commandPaletteOpen?: boolean;
      };
      return app?.commandPaletteOpen ?? false;
    });
    expect(paletteOpen).toBe(false);
  });

  test("header contains command palette trigger", async ({ appPage: page }) => {
    // Verify the Cmd+K button exists and has a title referencing the palette
    const hasTrigger = await page.evaluate(() => {
      const app = document.querySelector("milaidy-app");
      if (!app || !app.shadowRoot) return false;
      const buttons = app.shadowRoot.querySelectorAll("button");
      for (const btn of buttons) {
        if (
          btn.textContent?.includes("Cmd+K") ||
          btn.title?.toLowerCase().includes("palette") ||
          btn.title?.toLowerCase().includes("cmd")
        ) {
          return true;
        }
      }
      return false;
    });
    expect(hasTrigger).toBe(true);
  });
});
