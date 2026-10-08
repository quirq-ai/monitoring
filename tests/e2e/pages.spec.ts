import { expect, test, type Locator, type Page } from "@playwright/test";
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
    // The merged PR and the tree close live in innernet's matrix row, which opens into its entries.
    await page.getByRole("button", { name: /^5 changes for innernet/ }).click();
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

  test("Today folds what changed into one row per tracked repo, with a dot per change", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const matrix = page.locator("section").filter({ has: page.getByRole("heading", { name: "What changed" }) });
    // The row says its counts; the dots are decoration for the eye, one per change, oldest left.
    const innernet = matrix.getByRole("button", { name: "5 changes for innernet: 4 green, 1 red" });
    await expect(innernet).toBeVisible();
    expect(await innernet.locator("span > span").count(), "one dot per change").toBe(5);
    await expect(matrix.getByRole("link", { name: "innernet", exact: true })).toHaveAttribute("href", "/repos/innernet");
    // Busiest row first; every other repo with a change has its own row; the rest fold into one line.
    const rows = matrix.getByRole("button", { name: /changes? for / });
    expect(await rows.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")?.split(" ")[0]))).toEqual(["5", "2", "1", "1", "1"]);
    const quiet = matrix.getByRole("button", { name: /^\d+ tracked repos with no change$/ });
    await expect(quiet).toBeVisible();
    await expect(matrix.getByRole("link", { name: "depot", exact: true })).toHaveCount(0);
    await quiet.click();
    await expect(matrix.getByRole("link", { name: "depot", exact: true })).toHaveAttribute("href", "/repos/depot");
    const named = await quiet.evaluate((el) => Number(el.textContent?.trim().split(" ")[0]));
    expect(await matrix.locator("li li a").count(), "the folded line names every quiet repo").toBe(named);
    // Opening a row lists its entries, newest first, with their links; closed rows show nothing.
    await expect(matrix.getByText("tree closed")).toHaveCount(0);
    await innernet.click();
    const entries = matrix.locator("ol li");
    await expect(entries).toHaveCount(5);
    await expect(entries.first()).toContainText("tree open");
    await expect(entries.nth(1)).toContainText("since cleared");
    await expect(matrix.getByRole("link", { name: /merged #117/ })).toHaveAttribute("href", "https://github.com/quirq-ai/innernet/pull/117");
    // Seven days of changes still fit a phone: the dots wrap, the page never scrolls sideways.
    await page.goto("/?since=7d");
    const busiest = matrix.getByRole("button", { name: /changes for innernet/ });
    expect(await busiest.locator("span > span").count()).toBeGreaterThan(5);
    const fit = await busiest.evaluate((el) => ({ own: el.scrollWidth - el.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    expect(fit).toEqual({ own: 0, page: 0 });
  });

  test("the page tabs are centered in the header and never a scroll container", async ({ page }) => {
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/board");
      const nav = page.getByRole("navigation", { name: "Pages" });
      const box = await nav.evaluate((el) => {
        const header = el.closest("header")!.getBoundingClientRect();
        const list = el.querySelector("ul")!;
        const tabs = [...list.querySelectorAll("a")].map((a) => a.getBoundingClientRect());
        const left = Math.min(...tabs.map((t) => t.left));
        const right = Math.max(...tabs.map((t) => t.right));
        return {
          overflow: getComputedStyle(el).overflowX + "/" + getComputedStyle(el).overflowY,
          scrolls: el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth,
          offCenter: Math.abs((left + right) / 2 - (header.left + header.right) / 2),
          shortest: Math.min(...tabs.map((t) => t.height)),
        };
      });
      expect(box.overflow, `${vp.name}: the tab row is not a scroll container`).toBe("visible/visible");
      expect(box.scrolls, `${vp.name}: nothing to scroll`).toBe(false);
      expect(box.offCenter, `${vp.name}: tabs centered in the header`).toBeLessThanOrEqual(1);
      expect(box.shortest, `${vp.name}: every tab is a 44 px target`).toBeGreaterThanOrEqual(44);
    }
  });

  test("links that leave the dashboard open in a new tab; page links stay in this one", async ({ page }) => {
    for (const p of pages) {
      await page.goto(p.path);
      if (p.path === "/") for (const b of await page.getByRole("button", { name: /changes? for / }).all()) await b.click();
      const links = await page.locator("a[href]").evaluateAll((els) =>
        els.map((a) => ({ href: a.getAttribute("href") ?? "", target: a.getAttribute("target"), rel: (a.getAttribute("rel") ?? "").split(/\s+/) })),
      );
      const outside = links.filter((l) => /^https?:/i.test(l.href));
      const inside = links.filter((l) => l.href.startsWith("/") || l.href.startsWith("#"));
      expect(outside.length, `${p.path}: has outside links`).toBeGreaterThan(0);
      expect(inside.length, `${p.path}: has page links`).toBeGreaterThan(0);
      expect(outside.filter((l) => l.target !== "_blank" || !l.rel.includes("noopener") || !l.rel.includes("noreferrer")).map((l) => l.href), `${p.path}: every outside link opens a new tab safely`).toEqual([]);
      expect(inside.filter((l) => l.target).map((l) => l.href), `${p.path}: no page link opens a new tab`).toEqual([]);
      expect(links.filter((l) => !/^https?:/i.test(l.href) && !l.href.startsWith("/") && !l.href.startsWith("#")).map((l) => l.href), `${p.path}: every link is a page or an https link`).toEqual([]);
    }
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
    // or fresh, so nothing outside a state badge may carry the green marker: not as text, a fill,
    // a tint, a ring, a shadow, a border side or an outline. Colours are normalised through a
    // canvas and compared by RGB, so a tint (the marker at low alpha) counts as the marker.
    const okPill = page.getByText("ok", { exact: true }).first();
    await expect(okPill).toBeVisible();
    const colors = await page.evaluate(() => {
      // Any CSS colour (rgb, hex, or the oklab a Tailwind tint computes to) as sRGB bytes plus its
      // alpha: the alpha is split off and the opaque colour painted on a canvas and read back, so
      // a low-alpha tint keeps its hue instead of losing it to premultiplied rounding.
      const ctx = document.createElement("canvas").getContext("2d")!;
      const rgba = (value: string): [number, number, number, number] | null => {
        const v = value.trim();
        if (!v || v === "none" || v === "transparent") return null;
        let alpha = 1;
        let opaque = v;
        const slash = v.match(/^(.*)\/\s*([\d.]+%?)\s*\)$/);
        const comma = v.match(/^rgba\(([^)]*),\s*([\d.]+%?)\)$/);
        if (slash) {
          alpha = parseFloat(slash[2]) / (slash[2].endsWith("%") ? 100 : 1);
          opaque = `${slash[1].trim()})`;
        } else if (comma) {
          alpha = parseFloat(comma[2]) / (comma[2].endsWith("%") ? 100 : 1);
          opaque = `rgb(${comma[1]})`;
        }
        if (!(alpha > 0)) return null;
        ctx.fillStyle = "#010203";
        ctx.fillStyle = opaque;
        if (String(ctx.fillStyle) === "#010203" && opaque.replace(/\s/g, "").toLowerCase() !== "#010203") return null; // not a colour
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillRect(0, 0, 1, 1);
        const px = ctx.getImageData(0, 0, 1, 1).data;
        return [px[0], px[1], px[2], alpha];
      };
      const computed = (name: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${name})`;
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      const green = rgba(computed("--state-green"))!;
      const isGreen = (value: string) => {
        const c = rgba(value);
        return c !== null && c[3] > 0 && Math.max(Math.abs(c[0] - green[0]), Math.abs(c[1] - green[1]), Math.abs(c[2] - green[2])) <= 3;
      };
      const colourTokens = (value: string) => value.match(/(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\((?:[^()]|\([^()]*\))*\)|#[0-9a-fA-F]{3,8}\b/g) ?? [];
      const plain = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor", "textDecorationColor", "fill", "stroke"] as const;
      const greenOutsideBadges: string[] = [];
      for (const el of document.querySelectorAll("main *")) {
        if (el.closest(".state-badge")) continue;
        const s = getComputedStyle(el);
        const values = [...plain.map((p) => s[p]), ...colourTokens(s.boxShadow), ...colourTokens(s.backgroundImage)];
        if (values.some(isGreen)) greenOutsideBadges.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}"`);
      }
      const pill = [...document.querySelectorAll("main span")].find((el) => el.textContent === "ok");
      const pillStyle = pill ? getComputedStyle(pill) : undefined;
      return {
        green,
        greenOutsideBadges,
        pill: pillStyle && { color: rgba(pillStyle.color), background: rgba(pillStyle.backgroundColor) },
        muted: rgba(computed("--muted")),
        foreground: rgba(computed("--foreground")),
      };
    });
    expect(colors.green[3], "the marker itself parses").toBe(1);
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
    const link = row.locator('a[href="/repos/depot"]');
    await link.locator("span").evaluate((el) => (el.textContent = "d".repeat(100)));
    const card = row.locator("xpath=ancestor::*[@data-slot='card'][1]");
    const cardBox = await card.boundingBox();
    const badgeBox = await row.locator(".state-badge").boundingBox();
    const chevronBox = await details.boundingBox();
    expect(cardBox && badgeBox && chevronBox, "the row, its badge and its chevron are on the page").toBeTruthy();
    expect(badgeBox!.x + badgeBox!.width, "the badge stays inside the card").toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
    expect(chevronBox!.x + chevronBox!.width, "the chevron stays inside the card").toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
    expect(await link.evaluate((el) => el.scrollWidth - el.clientWidth), "the name wraps inside its link rather than running under the badge").toBeLessThanOrEqual(0);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways, "no horizontal page scroll with a long name").toBeLessThanOrEqual(0);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height, "under five phone screens, down from ten").toBeLessThan(4200);
    // The rows that need a look come first in each group.
    const names = await page.locator("main a[href^='/repos/']").evaluateAll((els) => els.map((e) => e.textContent?.trim()));
    expect(names.indexOf("xo-space")).toBeLessThan(names.indexOf("innernet"));
    expect(names.indexOf("gate")).toBeLessThan(names.indexOf("depot"));
  });

  test("a repo name at GitHub's 100-character limit wraps wherever one is shown", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const long = "n".repeat(100);
    // Each spot is stuffed with the name (appended after a badge, else in place of the text) and
    // must then wrap: no sideways page scroll, nothing drawn past the viewport, no overflow of its
    // own box. The Board's "Not in any registry" note is not rendered by the default fixtures.
    const spots: { path: string; what: string; find: (p: Page) => Locator; append?: boolean }[] = [
      { path: "/", what: "Today repo link", find: (p) => p.locator('main a[href^="/repos/"]:visible').first() },
      { path: "/", what: "Today matrix repo", find: (p) => p.locator('main a[href="/repos/innernet"]:visible').last() },
      { path: "/waiting", what: "Waiting repo link", find: (p) => p.locator('main a[href^="/repos/"]:visible').first() },
      { path: "/board", what: "Board product name", find: (p) => p.locator('main a[href="/repos/xo-space"]:visible').first() },
      { path: "/board", what: "Board product description", find: (p) => p.locator('main a[href="/repos/xo-space"]:visible').first().locator("xpath=following-sibling::span[1]") },
      { path: "/release", what: "Release heading", find: (p) => p.locator("main h2 a").first() },
      { path: "/repos/website", what: "page title", find: (p) => p.getByRole("heading", { level: 1 }) },
      { path: "/repos/website", what: "page lead", find: (p) => p.getByRole("heading", { level: 1 }).locator("xpath=following-sibling::p[1]") },
      { path: "/repos/website", what: "a reason next to an unknown badge", find: (p) => p.locator("main p", { has: p.locator(".state-badge") }).first(), append: true },
    ];
    for (const spot of spots) {
      await page.goto(spot.path);
      const el = spot.find(page);
      await expect(el, spot.what).toBeVisible();
      await el.evaluate((node, [text, append]) => (append ? node.append(` ${text}`) : (node.textContent = text)), [long, spot.append ?? false] as const);
      const fit = await el.evaluate((node) => ({
        right: node.getBoundingClientRect().right,
        own: node.scrollWidth - node.clientWidth,
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      expect.soft(fit.page, `${spot.what}: no sideways page scroll`).toBeLessThanOrEqual(0);
      expect.soft(fit.right, `${spot.what}: nothing drawn past the viewport`).toBeLessThanOrEqual(390);
      expect.soft(fit.own, `${spot.what}: wraps inside its own box`).toBeLessThanOrEqual(0);
    }
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
