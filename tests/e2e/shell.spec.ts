import { expect, test, type Page } from "@playwright/test";
import { contrast, MARKER_PAIRS, TEXT_PAIRS } from "../../lib/contrast";
import { origin } from "./origin";

const themes = ["light", "dark"] as const;
const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
] as const;

async function openThemed(page: Page, theme: "light" | "dark") {
  await page.context().addCookies([
    {
      name: "theme",
      value: theme,
      url: origin,
    },
  ]);
  await page.emulateMedia({ colorScheme: theme });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function computedTokens(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const names = [
      "--background",
      "--foreground",
      "--card",
      "--card-foreground",
      "--muted",
      "--muted-foreground",
      "--primary",
      "--primary-foreground",
      "--destructive",
      "--destructive-foreground",
      "--border",
      "--input",
      "--state-green",
      "--state-red",
      "--state-held",
      "--state-pending",
      "--state-unknown",
      "--state-stale",
    ];
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
  });
}

test.describe("theme and contrast", () => {
  for (const theme of themes) {
    for (const viewport of viewports) {
      test(`${viewport.name} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await openThemed(page, theme);
        await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
        await expect(page.getByRole("img", { name: "quirq" })).toBeVisible();

        const tokens = await computedTokens(page);
        const failures = [
          ...TEXT_PAIRS.filter(([fg, bg]) => contrast(tokens[fg] ?? "", tokens[bg] ?? "") < 4.5),
          ...MARKER_PAIRS.filter(([fg, bg]) => contrast(tokens[fg] ?? "", tokens[bg] ?? "") < 3),
        ].map(([fg, bg]) => `${fg} on ${bg}`);
        expect(failures).toEqual([]);

      });
    }
  }

  test("theme toggle stores the choice", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openThemed(page, "dark");
    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const cookie = (await page.context().cookies()).find((item) => item.name === "theme");
    expect(cookie?.value).toBe("light");
  });
});
