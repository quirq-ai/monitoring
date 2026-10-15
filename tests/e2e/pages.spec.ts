import { expect, test, type Locator, type Page } from "@playwright/test";
import { origin } from "./origin";

const themes = ["light", "dark"] as const;
const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
] as const;

const pages = [
  { path: "/", slug: "calendar", heading: "Calendar" },
  { path: "/blockers", slug: "blockers", heading: "Blockers" },
  { path: "/board", slug: "board", heading: "Board" },
  { path: "/release", slug: "release", heading: "Release" },
  { path: "/health", slug: "health", heading: "Health" },
  { path: "/gardener", slug: "gardener", heading: "Gardener" },
  { path: "/repos/xo-space", slug: "repo-xo-space", heading: "xo-space" },
  { path: "/settings", slug: "settings", heading: "Settings" },
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
  test("Calendar lists today's changes by time, the tree close marked cleared, with the Blockers counts", async ({ page }) => {
    await page.goto("/");
    // Seven days, today first and chosen; each day's link says its count in words.
    const days = page.getByRole("navigation", { name: "Days" }).getByRole("link");
    await expect(days).toHaveCount(7);
    await expect(days.first()).toHaveAttribute("aria-current", "date");
    await expect(days.first()).toHaveAttribute("aria-label", /^Today \d{1,2} \w+: \d+ changes?: /);
    await expect(page.getByRole("heading", { level: 2, name: /^Today · / })).toBeVisible();
    // The day's changes, newest first, each once with its time, state and link.
    const agenda = page.locator("main ol").first();
    await expect(agenda.getByText("merged #117 Fix: sources page scroll on phones")).toHaveCount(1);
    await expect(agenda.getByText(/canary held: held at verify/)).toHaveCount(1);
    await expect(agenda.getByText("tree closed")).toHaveCount(1);
    await expect(page.getByText("since cleared")).toHaveCount(1);
    await expect(agenda.getByRole("link", { name: /merged #117/ })).toHaveAttribute("href", "https://github.com/quirq-ai/innernet/pull/117");
    const times = await agenda.locator("time").evaluateAll((els) => els.map((el) => el.getAttribute("datetime") ?? ""));
    expect(times, "newest first").toEqual([...times].sort().reverse());
    await expect(page.getByRole("button", { name: /^\d+ tracked repos with no change$/ })).toBeVisible();
    // The counts moved to Blockers; one line here still says them and opens it.
    const blockers = page.getByRole("link", { name: /waiting .* red or held .* unknown/ });
    await expect(blockers).toContainText("4 waiting");
    await expect(blockers).toContainText("3 red or held");
    await expect(blockers).toHaveAttribute("href", "/blockers");
    await expect(page.locator("[data-slot=alert]"), "no API banner with a token and the API answering").toHaveCount(0);
    await expect(page.getByText(/Data as of/)).toBeVisible();
  });

  test("Calendar groups a day by repo, a row per tracked repo with a dot per change", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=repo");
    await expect(page.getByRole("link", { name: "by repo" })).toHaveAttribute("aria-current", "page");
    const innernet = page.getByRole("button", { name: "5 changes for innernet: 4 green, 1 red" });
    await expect(innernet).toBeVisible();
    expect(await innernet.locator("span > span").count(), "one dot per change").toBe(5);
    const quiet = page.getByRole("button", { name: /^\d+ tracked repos with no change$/ });
    await expect(page.getByRole("link", { name: "depot", exact: true })).toHaveCount(0);
    await quiet.click();
    await expect(page.getByRole("link", { name: "depot", exact: true })).toHaveAttribute("href", "/repos/depot");
    // The dots wrap inside the closed row: neither the row nor the page scrolls sideways.
    const fit = await innernet.evaluate((el) => ({ own: el.scrollWidth - el.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    expect(fit).toEqual({ own: 0, page: 0 });
    await innernet.click();
    await expect(page.locator("main ol li").first()).toContainText("tree open");
  });

  test("Calendar opens an earlier day, keeps the grouping, and ignores a day it does not show", async ({ page }) => {
    await page.goto("/?view=repo");
    const days = page.getByRole("navigation", { name: "Days" }).getByRole("link");
    const second = days.nth(1);
    const date = (await second.getAttribute("href"))!.match(/day=(\d{4}-\d{2}-\d{2})/)![1];
    expect(await second.getAttribute("href")).toBe(`/?day=${date}&view=repo`);
    await second.click();
    await expect(second).toHaveAttribute("aria-current", "date");
    await expect(days.first()).not.toHaveAttribute("aria-current", "date");
    await expect(page.getByText(/Deploys and channel moves keep only their newest event/)).toBeVisible();
    await expect(page.getByRole("link", { name: "by repo" })).toHaveAttribute("aria-current", "page");
    // A date the calendar does not show, or anything else, is today.
    for (const bad of ["1999-01-01", "../etc", ""]) {
      await page.goto(`/?day=${bad}`);
      await expect(days.first(), bad).toHaveAttribute("aria-current", "date");
    }
  });

  test("/waiting moved to /blockers", async ({ page }) => {
    const response = await page.goto("/waiting");
    expect(response?.url()).toMatch(/\/blockers$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blockers");
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
          rows: new Set(tabs.map((t) => Math.round(t.top))).size,
        };
      });
      expect(box.overflow, `${vp.name}: the tab row is not a scroll container`).toBe("visible/visible");
      expect(box.scrolls, `${vp.name}: nothing to scroll`).toBe(false);
      expect(box.offCenter, `${vp.name}: tabs centered in the header`).toBeLessThanOrEqual(1);
      expect(box.shortest, `${vp.name}: every tab is a 44 px target`).toBeGreaterThanOrEqual(44);
      expect(box.rows, `${vp.name}: the tabs fit one row`).toBe(1);
    }
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/settings");
    expect(await page.locator("header").evaluate((h) => h.getBoundingClientRect().height)).toBeLessThanOrEqual(101);
    await expect(page.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  });

  test("the header keeps the full wordmark, centered tabs and one row of tabs at every width", async ({ page }) => {
    // Every width from 300 to 1000 px, and every 5 px up to 1280, on four pages. Below 334 px the tabs may wrap (as they always
    // have at 320); from 334 px up they keep one row. The wordmark (the home link) never shrinks, and
    // each row of tabs stays centered: six tabs once crushed it at 768-884 px.
    test.setTimeout(300_000);
    const problems: string[] = [];
    for (const path of ["/board", "/gardener", "/health", "/settings"]) {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      for (let width = 300; width <= 1280; width += width < 1000 ? 1 : 5) {
        await page.setViewportSize({ width, height: 800 });
        const m = await page.evaluate(() => {
          const header = document.querySelector("header")!.getBoundingClientRect();
          const mark = document.querySelector("header img.brand-wordmark")!.getBoundingClientRect();
          const tabs = [...document.querySelectorAll('nav[aria-label="Pages"] a')].map((a) => a.getBoundingClientRect());
          const rows = new Map<number, DOMRect[]>();
          for (const t of tabs) rows.set(Math.round(t.top), [...(rows.get(Math.round(t.top)) ?? []), t]);
          const offCenter = Math.max(...[...rows.values()].map((r) => Math.abs((Math.min(...r.map((t) => t.left)) + Math.max(...r.map((t) => t.right))) / 2 - (header.left + header.right) / 2)));
          return {
            mark: mark.width,
            rows: rows.size,
            offCenter,
            height: header.height,
            edge: Math.min(...tabs.map((t) => t.left), ...tabs.map((t) => window.innerWidth - t.right)),
            scrolls: document.documentElement.scrollWidth > window.innerWidth,
          };
        });
        const bad = [
          m.mark < 46 && `wordmark ${m.mark.toFixed(1)} px`,
          m.offCenter > 1 && `tabs ${m.offCenter.toFixed(1)} px off center`,
          width >= 334 && m.rows !== 1 && `${m.rows} rows of tabs`,
          width >= 334 && m.height > 101 && `header ${m.height} px`,
          m.edge < 4 && `a tab ${m.edge.toFixed(1)} px from the edge`,
          m.scrolls && "sideways scroll",
        ].filter(Boolean);
        if (bad.length) problems.push(`${path} at ${width}: ${bad.join(", ")}`);
      }
    }
    expect(problems.slice(0, 20), `${problems.length} problems`).toEqual([]);
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

  test("Blockers shows the counts, what waits on you once each, and what else is broken", async ({ page }) => {
    await page.goto("/blockers");
    // The three counts moved here from Today; the first opens the list below.
    const waitingTile = page.getByRole("link", { name: /waiting on you/ });
    await expect(waitingTile).toContainText("4");
    await expect(waitingTile).toHaveAttribute("href", "#waiting");
    await expect(page.getByRole("link", { name: /red or held/ })).toContainText("3");
    await expect(page.getByRole("link", { name: /unknown, stale or failing/ })).toBeVisible();
    await expect(page.getByText("some sources unread")).toHaveCount(0);
    await expect(page.getByText(/^stale: read/)).toHaveCount(0);
    const waiting = page.locator("#waiting");
    await expect(waiting.getByRole("listitem")).toHaveCount(4);
    await expect(waiting.getByText("review requested", { exact: true })).toHaveCount(1);
    await expect(waiting.getByText("approval on an older head", { exact: true })).toHaveCount(1);
    await expect(waiting.getByText("canary held", { exact: true })).toHaveCount(1);
    await expect(waiting.getByText("open failure", { exact: true })).toHaveCount(1);
    await expect(page.getByText(/Planted/)).toHaveCount(0);
    // Broken right now: the failed deploy and the failed writer (which opens Health). The held
    // canary and its issue are already waiting on you, and the cleared tree close is history.
    const broken = page.locator("#broken");
    await expect(broken.getByRole("listitem")).toHaveCount(2);
    await expect(broken.getByRole("link", { name: /deploy failure 7f3b1a2/ })).toBeVisible();
    await expect(broken.getByRole("link", { name: /scorecard writer failure/ })).toHaveAttribute("href", "/health");
    await expect(broken.getByText(/canary held|qq-failure|tree closed/)).toHaveCount(0);
    await waitingTile.click();
    await expect(page).toHaveURL(/#waiting$/);
  });

  test("Board pins every registry repo once as a note, with the planted red CI and failed deploy", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/board");
    const notes = page.locator("main li[id^='repo-']");
    for (const repo of ["innernet", "xo-space", "website", "gate", "release", "gardener", "monitoring", "wiki", "euler"]) {
      // The overview chips are named "<repo>, <state>", so the note's own link is the only exact match.
      await expect(page.getByRole("link", { name: repo, exact: true })).toHaveCount(1);
      await expect(notes.filter({ has: page.getByRole("link", { name: repo, exact: true }) })).toHaveCount(1);
    }
    const xo = page.locator("#repo-xo-space");
    await expect(xo.getByText("1 of 2 failed: presubmit")).toBeVisible();
    await expect(xo.getByText(/held: held at verify/)).toBeVisible();
    await expect(page.locator("#repo-website").getByText(/failure 7f3b1a2/)).toBeVisible();
    // A note is tinted by its repo's worst state; unknown stays paper with a dashed edge.
    await expect(xo).toHaveAttribute("data-note-state", "red");
    await expect(page.locator("#repo-gate")).toHaveAttribute("data-note-state", "pending");
    expect(await page.locator("#repo-wiki").evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("dashed");
    // The overview indexes every note once, by state, and a chip jumps to its note, clear of the
    // sticky header.
    const chips = page.locator("#overview").getByRole("link", { name: /^\S+, (green|red|held|pending|unknown|stale)$/ });
    await expect(chips).toHaveCount(await notes.count());
    await page.locator("#overview").getByRole("link", { name: "gate, pending" }).click();
    await expect(page).toHaveURL(/#repo-gate$/);
    const gate = page.locator("#repo-gate");
    await expect(gate).toBeInViewport();
    expect(await gate.evaluate((el) => el.matches(":target")), "the jumped-to note is the target").toBe(true);
    const below = await gate.evaluate((el) => el.getBoundingClientRect().top - document.querySelector("header")!.getBoundingClientRect().bottom);
    expect(below, "the note is not under the sticky header").toBeGreaterThanOrEqual(0);
  });

  test("Board's needs-a-look filter keeps only the notes that need a look", async ({ page }) => {
    await page.goto("/board?show=look");
    await expect(page.getByRole("link", { name: "needs a look" })).toHaveAttribute("aria-current", "page");
    const ids = await page.locator("main li[id^='repo-']").evaluateAll((els) => els.map((el) => el.id).sort());
    expect(ids).toEqual(["repo-gate", "repo-website", "repo-wiki", "repo-xo-space"]);
    await expect(page.locator("#overview").getByRole("link", { name: /, / })).toHaveCount(4);
    // A board with nothing to look at says so rather than vanishing; its tally still counts its repos.
    await expect(page.getByText("Nothing on this board needs a look.")).toHaveCount(2);
    await expect(page.locator("#board-other")).toContainText("7 green");
    await page.getByRole("link", { name: "all notes" }).click();
    await expect(page.locator("#repo-depot")).toBeVisible();
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

  test("on a phone the Board's green repos are small notes and the page stays short", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/board");
    // The products and the repos that need a look are full notes with their fields; a green repo
    // is a small note with its name, its state said to screen readers.
    await expect(page.getByText("CI on main", { exact: true })).toHaveCount(5);
    const depot = page.locator("#repo-depot");
    const link = depot.getByRole("link", { name: "depot", exact: true });
    await expect(link).toBeVisible();
    await expect(depot.getByText(/checks passed/)).toBeHidden();
    await expect(depot.locator(".sr-only")).toHaveText("green");
    // A repo name at GitHub's 100-character limit wraps inside its small note, and the page does
    // not scroll sideways.
    await link.evaluate((el) => (el.textContent = "d".repeat(100)));
    expect(await depot.evaluate((el) => el.scrollWidth - el.clientWidth), "the name wraps inside its note").toBeLessThanOrEqual(0);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways, "no horizontal page scroll with a long name").toBeLessThanOrEqual(0);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height, "under five phone screens").toBeLessThan(4200);
    // The notes that need a look come first on each board (by id: depot's name was just replaced).
    const ids = await page.locator("main li[id^='repo-']").evaluateAll((els) => els.map((e) => e.id));
    expect(ids.indexOf("repo-xo-space")).toBeLessThan(ids.indexOf("repo-innernet"));
    expect(ids.indexOf("repo-gate")).toBeLessThan(ids.indexOf("repo-depot"));
  });

  test("a repo name at GitHub's 100-character limit wraps wherever one is shown", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const long = "n".repeat(100);
    // Each spot is stuffed with the name (appended after a badge, else in place of the text) and
    // must then wrap: no sideways page scroll, nothing drawn past the viewport, no overflow of its
    // own box. The Board's "Not in any registry" note is not rendered by the default fixtures.
    const spots: { path: string; what: string; find: (p: Page) => Locator; append?: boolean }[] = [
      { path: "/", what: "Calendar repo link", find: (p) => p.locator('main a[href^="/repos/"]:visible').first() },
      { path: "/?view=repo", what: "Calendar matrix repo", find: (p) => p.locator('main a[href="/repos/innernet"]:visible').last() },
      { path: "/blockers", what: "Blockers repo link", find: (p) => p.locator('main a[href^="/repos/"]:visible').first() },
      { path: "/board", what: "Board product name", find: (p) => p.locator('main a[href="/repos/xo-space"]:visible').first() },
      { path: "/board", what: "Board product description", find: (p) => p.locator('main a[href="/repos/xo-space"]:visible').first().locator("xpath=following-sibling::span[1]") },
      { path: "/release", what: "Release heading", find: (p) => p.locator("main h2 a").first() },
      { path: "/gardener", what: "Gardener repo name", find: (p) => p.locator("main h3").first() },
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

  test("Gardener answers from the gardener's own files, read-only, with nothing assumed done", async ({ page }) => {
    await page.goto("/gardener");
    const trees = page.locator("section", { has: page.getByRole("heading", { name: "Is the tree open?" }) });
    await expect(trees.getByRole("heading", { level: 3 })).toHaveText(["xo-space", "innernet"]);
    await expect(trees.getByText("website")).toHaveCount(0);
    const reporting = page.locator("section", { has: page.getByRole("heading", { name: "Why is it only reporting?" }) });
    await expect(reporting.locator(".state-badge[data-state=green]")).toHaveCount(0);
    await expect(reporting.getByText(/at the gardener's pin bf3ad29/)).toBeVisible();
    await expect(page.getByText("innernet closed").first()).toBeVisible();
    // Nothing on the page acts: no buttons and no forms.
    await expect(page.locator("main button, main form")).toHaveCount(0);
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
