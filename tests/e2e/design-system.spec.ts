import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Spec 0003 checks that need no backend: axe in both themes, theme before first
// paint, keyboard behavior of overlays, reduced motion.

async function usePreference(page: Page, pref: "light" | "dark" | "system") {
  await page.addInitScript((value) => window.localStorage.setItem("aurevia-theme", value), pref);
}

for (const theme of ["light", "dark"] as const) {
  test(`styleguide has no serious axe violations in ${theme} (AC-2, AC-10)`, async ({ page }) => {
    await usePreference(page, theme);
    await page.goto("/styleguide");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("heading", { name: "Styleguide" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .exclude("nextjs-portal")
      .analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), null, 2)).toEqual([]);
  });
}

test("stored dark theme applies before React hydrates (AC-3)", async ({ page }) => {
  await usePreference(page, "dark");
  await page.route("**/_next/static/chunks/**", (route) => route.abort());
  await page.goto("/styleguide", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme-pref", "dark");
});

test("system preference follows the device setting (AC-3)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/styleguide");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("theme toggle switches and remembers the choice (AC-4)", async ({ page }) => {
  await page.goto("/styleguide");
  const trigger = page.getByRole("banner").getByRole("button", { name: "Theme" });
  await trigger.click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("dialog keeps focus, closes on Escape, and returns focus (AC-9)", async ({ page }) => {
  await page.goto("/styleguide");
  const opener = page.getByRole("button", { name: "Open dialog" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Confirm viewing" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const active = document.activeElement;
      return !active || active === document.body || Boolean(active.closest("dialog[open]"));
    });
    expect(inside).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("toast shows above an open dialog (AC-16)", async ({ page }) => {
  await page.goto("/styleguide");
  await page.getByRole("button", { name: "Open dialog" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Show toast" }).click();
  const toastText = page.getByText("Toast above the dialog");
  await expect(toastText).toBeVisible();
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(toastText).toBeHidden();
});

test("menu opens with arrow keys and closes on Escape (AC-9)", async ({ page }) => {
  await page.goto("/styleguide");
  const trigger = page.getByRole("button", { name: "Sample menu" });
  await trigger.click();
  await expect(page.getByRole("menuitem", { name: "Profile" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Save" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Sample menu" })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("reduced motion turns transitions off (AC-11)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/styleguide");
  const duration = await page
    .locator("article")
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(Number.parseFloat(duration)).toBeLessThan(0.001);
});

test("cards fall back to a framed icon for missing or broken photos (AC-12)", async ({ page }) => {
  await page.goto("/styleguide");
  await expect(page.getByText("Tilagor Corner Plot, no photo available")).toBeAttached();
  await expect(page.getByText("Garden house front, no photo available")).toBeAttached({ timeout: 15_000 });
  await expect(page.getByText("BDT 12,500,000")).toBeVisible();
  await expect(page.getByText("5.5 katha")).toBeVisible();
});
