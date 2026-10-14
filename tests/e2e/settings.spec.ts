import { existsSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import { EDITOR_KEY, editorOrigin, FAKE_GH_LOG } from "./origin";

// The settings editor: the deployed form (it writes nothing and hands over a gh script) and the
// local one (pnpm editor), here with tests/fake-gh/gh, which logs each write instead of sending it.

const byId = (page: Page, id: string) => page.locator(`[id="${id}"]`);

test.describe("settings editor, deployed form", () => {
  test("an edit is reviewed as a diff and handed over as a gh script", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByTestId("connect")).toContainText("never with this site's token");
    await page.getByRole("button", { name: /Rulesets and repo settings/ }).click();
    const sw = byId(page, "gate/settings/github.toml::repo[0].allow_auto_merge");
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await sw.click();
    await expect(page.getByText("was false")).toBeVisible();
    await page.getByRole("button", { name: "Review 1 change" }).click();
    const diff = page.getByRole("region", { name: "Changes to gate/settings/github.toml" });
    await expect(diff).toContainText("allow_auto_merge = true");
    await expect(diff).toContainText("allow_auto_merge = false");
    const script = await page.getByLabel("The gh script").inputValue();
    expect(script).toContain("Type yes to go ahead");
    expect(script).toContain("repos/quirq-ai/gate/contents/settings/github.toml");
    await page.getByRole("button", { name: "Back to editing" }).click();
    await expect(page.getByRole("status").filter({ hasText: "1 change" })).toBeVisible();
  });

  test("a property change needs the tick before the script appears", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: /^monitoring role/ }).click();
    await byId(page, "property::monitoring::stage").selectOption("active");
    await page.getByRole("button", { name: "Review 1 change" }).click();
    await expect(page.getByText("Tick the box above")).toBeVisible();
    await expect(page.getByLabel("The gh script")).toHaveCount(0);
    await page.getByLabel(/Change this property on GitHub/).click();
    await expect(page.getByLabel("The gh script")).toHaveValue(/properties\/values/);
  });

  test("an owner that is not a GitHub handle holds the review back", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: /gate CODEOWNERS/ }).click();
    await byId(page, "gate/.github/CODEOWNERS::/settings/").fill("@sharmasuraj0123 not-a-handle");
    await expect(page.getByText("not-a-handle is not an owner")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Review/ })).toBeDisabled();
  });
});

test.describe("settings editor, local with gh", () => {
  test("a page reached under another name (DNS rebinding) gets nothing", async () => {
    const { port } = new URL(editorOrigin);
    const status = (host: string) =>
      new Promise<number>((done, fail) => {
        httpRequest({ host: "127.0.0.1", port, path: "/settings", headers: { host } }, (res) => {
          res.resume();
          done(res.statusCode ?? 0);
        })
          .on("error", fail)
          .end();
      });
    expect(await status(`evil.example:${port}`)).toBe(403);
    expect(await status(`127.0.0.1:${port}`)).toBe(200);
  });

  test("without the printed link's key the page says so and cannot write", async ({ page }) => {
    await page.goto(`${editorOrigin}/settings`);
    await expect(page.getByTestId("connect")).toContainText("Open the link pnpm editor printed");
  });

  test("opens the pull request as the gh login", async ({ page }) => {
    await page.goto(`${editorOrigin}/settings#key=${EDITOR_KEY}`);
    await expect(page.getByTestId("connect")).toContainText("Connected as @sam-example");
    expect(page.url()).not.toContain("key=");
    await page.getByRole("button", { name: /infra-config CODEOWNERS/ }).click();
    await byId(page, "infra-config/.github/CODEOWNERS::/tests/").fill("@sharmasuraj0123 @sam-example");
    await page.getByRole("button", { name: "Review 1 change" }).click();
    await expect(page.getByRole("region", { name: "Changes to infra-config/.github/CODEOWNERS" })).toContainText("@sam-example");
    // The log outlives a run, so only the lines this click adds count.
    const logged = () => (existsSync(FAKE_GH_LOG) ? readFileSync(FAKE_GH_LOG, "utf8").split("\n").filter(Boolean) : []);
    const before = logged().length;
    await page.getByRole("button", { name: "Open 1 pull request" }).click();
    await expect(page.getByText("Done as @sam-example")).toBeVisible();
    await expect(page.getByRole("link", { name: "open" })).toHaveAttribute("href", "https://github.com/quirq-ai/infra-config/pull/101");
    const writes = logged()
      .slice(before)
      .map((l) => JSON.parse(l) as { method: string; path: string; body: { content?: string } })
      .filter((w) => w.path.startsWith("repos/quirq-ai/infra-config/"));
    expect(writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      "POST repos/quirq-ai/infra-config/git/refs",
      "PUT repos/quirq-ai/infra-config/contents/.github/CODEOWNERS",
      "POST repos/quirq-ai/infra-config/pulls",
    ]);
    expect(Buffer.from(writes[1].body.content!, "base64").toString("utf8")).toMatch(/^\/tests\/ +@sharmasuraj0123 @sam-example$/m);
  });
});
