import { expect, test, type Page } from "@playwright/test";
import { FRAMING_CSP, NO_FRAMING_CSP } from "../../config/framing";
import { editorOrigin, origin } from "./origin";

// The quirq.dev website shows the dashboard in an iframe (config/framing.ts). Only that site and
// the dashboard itself may frame it; the local settings editor may not be framed at all.

const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
] as const;

// Chromium will not let a public https page frame a loopback address, so the frame is served
// under the dashboard's own name and each request is answered by the local server, headers and
// all, as the website would see it.
const DASHBOARD = "https://monitoring.quirq.dev";

/** Serves `parent` as a page that frames the dashboard (answered by `local`), and returns that frame. */
async function framedBy(page: Page, parent: string, local = origin, path = "/") {
  await page.route(`${DASHBOARD}/**`, async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: `${local}${url.pathname}${url.search}`, maxRedirects: 0 }) });
  });
  await page.route(`${parent}/`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>host</title><style>body{margin:0}iframe{border:0;width:100vw;height:100vh;display:block}</style><iframe title="monitoring" src="${DASHBOARD}${path}"></iframe>`,
    }),
  );
  await page.goto(`${parent}/`);
  return page.frameLocator('iframe[title="monitoring"]');
}

test.describe("framing", () => {
  // Prefetches the frame starts may still be in flight when a test ends.
  test.afterEach(async ({ page }) => page.unrouteAll({ behavior: "ignoreErrors" }));

  test("every kind of response says who may frame it", async ({ request }) => {
    const html = await (await request.get("/")).text();
    const css = html.match(/\/_next\/static\/[^"]+\.css/)?.[0];
    expect(css).toBeTruthy();
    for (const path of ["/", "/health", "/blockers", "/api/snapshot", "/repos/no-such-repo", "/no-such-page", "/brand/quirq/wordmark.svg", "/favicon.ico", css!]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect.soft(res.headers()["content-security-policy"], path).toBe(FRAMING_CSP);
      expect.soft(res.headers()["x-frame-options"], path).toBeUndefined();
    }
  });

  for (const theme of ["light", "dark"] as const) {
    for (const vp of viewports) {
      test(`www.quirq.dev frames it, ${vp.name} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({ colorScheme: theme });
        const frame = await framedBy(page, "https://www.quirq.dev");
        await expect(frame.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
        // With no theme cookie the frame follows the viewer's colour scheme.
        await expect(frame.locator("body")).toHaveCSS("background-color", theme === "light" ? "rgb(250, 250, 250)" : "rgb(0, 0, 0)");
        // A page link moves the frame, not the website around it.
        await frame.getByRole("link", { name: "Health", exact: true }).first().click();
        await expect(frame.getByRole("heading", { level: 1, name: "Health" })).toBeVisible();
        expect(new URL(page.url()).origin).toBe("https://www.quirq.dev");
        await page.screenshot({ path: `test-results/screenshots/framed-${vp.name}-${theme}.png` });
      });
    }
  }

  test("quirq.dev frames it", async ({ page }) => {
    const frame = await framedBy(page, "https://quirq.dev");
    await expect(frame.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  });

  for (const parent of ["https://evil.example", "https://quirq.dev.evil.example", "https://monitoring-git-x.vercel.app"]) {
    test(`${parent} cannot frame it`, async ({ page }) => {
      const refused = page.waitForEvent("console", (m) => m.text().includes("frame-ancestors"));
      await framedBy(page, parent);
      await refused;
      await expect(page.frameLocator('iframe[title="monitoring"]').getByRole("heading", { level: 1 })).toHaveCount(0);
    });
  }

  test("the local settings editor cannot be framed, even by the website", async ({ page, request }) => {
    for (const path of ["/", "/settings", "/no-such-page"]) {
      expect.soft((await request.get(`${editorOrigin}${path}`)).headers()["content-security-policy"], path).toBe(NO_FRAMING_CSP);
    }
    const refused = page.waitForEvent("console", (m) => m.text().includes("frame-ancestors"));
    await framedBy(page, "https://www.quirq.dev", editorOrigin, "/settings");
    await refused;
  });
});
