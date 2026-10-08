import { expect, test, type Page } from "@playwright/test";
import { origin } from "./origin";

const themes = ["light", "dark"] as const;
const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
] as const;

const pages = [
  { path: "/", slug: "today", heading: "Today" },
  { path: "/waiting", slug: "waiting", heading: "Waiting on you" },
  { path: "/board", slug: "board", heading: "Board" },
  { path: "/release", slug: "release", heading: "Release" },
  { path: "/health", slug: "health", heading: "Health" },
  { path: "/repos/xo-space", slug: "repo-xo-space", heading: "xo-space" },
] as const;

async function openThemed(page: Page, path: string, theme: "light" | "dark") {
  await page.context().addCookies([{ name: "theme", value: theme, url: origin }]);
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

test.describe("pages", () => {
  for (const p of pages) {
    for (const vp of viewports) {
      for (const theme of themes) {
        test(`${p.slug} ${vp.name} ${theme}`, async ({ page }) => {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await openThemed(page, p.path, theme);
          await expect(page.getByRole("heading", { level: 1 })).toHaveText(p.heading);
          await page.screenshot({ path: `test-results/screenshots/${p.slug}-${vp.name}-${theme}.png`, fullPage: true });
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow, "no horizontal page scroll").toBeLessThanOrEqual(0);
        });
      }
    }
  }
});

test.describe("content from the fixtures", () => {
  test("Today shows the merged PR, the held canary, the tree close and the counts", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("merged #117 Fix: sources page scroll on phones")).toHaveCount(1);
    await expect(page.getByText(/canary held: held at verify/)).toHaveCount(1);
    await expect(page.getByText("tree closed")).toHaveCount(1);
    await expect(page.getByRole("link", { name: /waiting on you/ })).toContainText("4");
    await expect(page.getByRole("link", { name: /red or held/ })).toContainText("3");
    await expect(page.getByRole("link", { name: /unknown, stale or failing/ })).toBeVisible();
    await expect(page.getByText("some sources unread")).toHaveCount(0);
    await expect(page.getByText(/^stale: read/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Needs a look" })).toBeVisible();
    // The failed scorecard writer needs a look and opens Health; the tree close is history now.
    const alarms = page.locator("section").filter({ has: page.getByRole("heading", { name: "Needs a look" }) });
    await expect(alarms.getByRole("link", { name: /scorecard writer failure/ })).toHaveAttribute("href", "/health");
    await expect(alarms.getByText("tree closed")).toHaveCount(0);
    await expect(page.getByText("since cleared")).toHaveCount(1);
    await expect(page.locator("[data-slot=alert]"), "no API banner with a token and the API answering").toHaveCount(0);
    await expect(page.getByText(/^Data as of/)).toBeVisible();
  });

  test("Waiting lists the review, the stale approval, the held canary and the failure once each", async ({ page }) => {
    await page.goto("/waiting");
    const items = page.locator("ol").getByRole("listitem");
    await expect(items).toHaveCount(4);
    await expect(page.getByText("review requested", { exact: true })).toHaveCount(1);
    await expect(page.getByText("approval on an older head", { exact: true })).toHaveCount(1);
    await expect(page.getByText("canary held", { exact: true })).toHaveCount(1);
    await expect(page.getByText("open failure", { exact: true })).toHaveCount(1);
    await expect(page.getByText(/Planted/)).toHaveCount(0);
  });

  test("Board lists every registry repo once with the planted red CI and failed deploy", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/board");
    for (const repo of ["innernet", "xo-space", "website", "gate", "release", "gardener", "monitoring", "wiki", "euler"]) {
      await expect(page.getByRole("link", { name: repo, exact: true })).toHaveCount(1);
    }
    const xo = page.getByRole("row").filter({ has: page.getByRole("link", { name: "xo-space", exact: true }) });
    await expect(xo.getByText("1 of 2 failed: presubmit")).toBeVisible();
    const website = page.getByRole("row").filter({ has: page.getByRole("link", { name: "website", exact: true }) });
    await expect(website.getByText(/failure 7f3b1a2/)).toBeVisible();
    await expect(xo.getByText(/held: held at verify/)).toBeVisible();
    // Every column is in view: no table hides columns behind its wrapper's horizontal scroll.
    const hidden = await page.locator("[data-slot=table-container]").evaluateAll((els) => els.map((el) => el.scrollWidth - el.clientWidth));
    expect(hidden, "table columns hidden behind a scroll").toEqual(hidden.map(() => 0));
  });

  test("Release shows the channels in file order and a held canary with its hold", async ({ page }) => {
    await page.goto("/release");
    await expect(page.getByText(/Channels in order: canary .* then dev .* then stable/)).toBeVisible();
    await expect(page.getByText(/held at verify since/)).toBeVisible();
    await expect(page.locator("figure").getByRole("link", { name: /^\d{4}-\d{2}-\d{2}: held, held at verify/ })).toHaveCount(1);
    // The report is Markdown rendered as elements: a heading and a table, never raw pipes.
    await expect(page.getByRole("heading", { level: 3, name: /^Canary report \d{4}-\d{2}-\d{2}/ })).toBeVisible();
    await expect(page.locator(".markdown table").first()).toBeVisible();
    await expect(page.locator(".markdown").getByText("|---|")).toHaveCount(0);
    // A keyboard can reach the table's scroll box (axe: scrollable-region-focusable).
    const regions = page.locator(".markdown [role=region][tabindex='0']");
    await expect(regions.first()).toHaveAttribute("aria-label", "Table 1 in the report");
    expect(new Set(await regions.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).size, "every table region has its own label").toBe(await regions.count());
  });

  test("Health shows eight fresh writers, one red writer and the ledger not started", async ({ page }) => {
    await page.goto("/health");
    await expect(page.getByText("ledger not started").first()).toBeVisible();
    await expect(page.getByText(/scorecard failure .*the data may still be current/)).toBeVisible();
    // The org list was read three hours ago on a one-hour window (routes.json backdates it): the
    // one stale read, listed after the unknown rows and before every "ok".
    const sources = page.locator("main ul > li", { has: page.locator("a.font-mono") });
    const stale = sources.filter({ has: page.getByText(/^stale$/) });
    await expect(stale).toHaveCount(1);
    await expect(stale).toContainText("github/org-repos");
    await expect(stale).toContainText(/read 3 h ago, not refreshed yet/);
    const order = await sources.evaluateAll((rows) => rows.map((row) => row.querySelector(".state-badge")?.textContent ?? "ok"));
    expect(order.indexOf("stale"), "after the unknown rows").toBeGreaterThan(order.lastIndexOf("unknown"));
    expect(order.indexOf("stale"), "before the first ok row").toBeLessThan(order.indexOf("ok"));
    // A read that answered is "ok" on the muted pill, in the text color: readable is not healthy
    // or fresh, so nothing outside a state badge may carry the green marker, as a tint or as text.
    const okPill = page.getByText("ok", { exact: true }).first();
    await expect(okPill).toBeVisible();
    const colors = await page.evaluate(() => {
      const computed = (name: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${name})`;
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      const green = computed("--state-green");
      const greenOutsideBadges: string[] = [];
      for (const el of document.querySelectorAll("main *")) {
        if (el.closest(".state-badge")) continue;
        const s = getComputedStyle(el);
        if ([s.color, s.backgroundColor, s.borderColor, s.outlineColor].includes(green)) greenOutsideBadges.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}"`);
      }
      const pill = [...document.querySelectorAll("main span")].find((el) => el.textContent === "ok");
      const pillStyle = pill ? getComputedStyle(pill) : undefined;
      return { greenOutsideBadges, pill: pillStyle && { color: pillStyle.color, background: pillStyle.backgroundColor }, muted: computed("--muted"), foreground: computed("--foreground") };
    });
    expect(colors.greenOutsideBadges).toEqual([]);
    expect(colors.pill).toEqual({ color: colors.foreground, background: colors.muted });
  });

  test("on a phone the Board folds green repos into one line each and stays short", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/board");
    // A green infra repo is a collapsed row: its fields are hidden until the chevron is tapped.
    const details = page.getByRole("button", { name: "Details for depot" });
    await expect(details).toBeVisible();
    const fields = page.getByText("CI on main", { exact: true });
    const before = await fields.count();
    expect(before, "the products and the repos that need a look are open cards").toBeGreaterThanOrEqual(4);
    await details.click();
    await expect(fields).toHaveCount(before + 1);
    // A repo name at GitHub's 100-character limit wraps inside its folded row: the badge and the
    // chevron stay in the card and the page does not scroll sideways.
    const row = details.locator("xpath=parent::*");
    const link = row.getByRole("link", { name: "depot" });
    await link.locator("span").evaluate((el) => (el.textContent = "d".repeat(100)));
    const card = row.locator("xpath=ancestor::*[@data-slot='card'][1]");
    const cardBox = await card.boundingBox();
    const badgeBox = await row.locator(".state-badge").boundingBox();
    const chevronBox = await details.boundingBox();
    expect(cardBox && badgeBox && chevronBox, "the row, its badge and its chevron are on the page").toBeTruthy();
    expect(badgeBox!.x + badgeBox!.width, "the badge stays inside the card").toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
    expect(chevronBox!.x + chevronBox!.width, "the chevron stays inside the card").toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways, "no horizontal page scroll with a long name").toBeLessThanOrEqual(0);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height, "under five phone screens, down from ten").toBeLessThan(4200);
    // The rows that need a look come first in each group.
    const names = await page.locator("main a[href^='/repos/']").evaluateAll((els) => els.map((e) => e.textContent?.trim()));
    expect(names.indexOf("xo-space")).toBeLessThan(names.indexOf("innernet"));
    expect(names.indexOf("gate")).toBeLessThan(names.indexOf("depot"));
  });

  test("an unknown repo is a 404", async ({ page }) => {
    const response = await page.goto("/repos/no-such-repo");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Not found");
  });

  test("the snapshot route answers JSON that carries no token", async ({ request }) => {
    const res = await request.get("/api/snapshot");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("fixture-token-never-real");
    const json = JSON.parse(text);
    expect(json.schema).toBe("qq-monitoring-snapshot/1");
    expect(json.counts.waiting).toBe(4);
  });
});
