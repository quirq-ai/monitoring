<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent guide

How an agent builds and changes the quirq-ai monitoring dashboard. Read [`README.md`](README.md)
first: it says what the dashboard is for, what it covers and how it must look. This file says how
to build it so it stays simple, where every piece of data comes from, and how to prove each change
before asking for review.

## The rules that do not bend

1. **Read-only.** The dashboard never writes to GitHub or anywhere else: no merges, approvals,
   comments, dispatches, ref moves, issues or labels. No code path calls a GitHub endpoint with a
   method other than `GET`, and GraphQL is queries only, never mutations. A test enforces this (M1).
2. **Bound to the source.** Every value on screen comes from exactly one source module in
   `lib/sources/`, carries that source's URL and fetch time, and links to it. Pages never call
   `fetch` or the GitHub API directly.
3. **Missing is never green.** A source that fails, times out, does not parse, or whose writer has
   not run within its window yields `unknown` or `stale` with a one-line reason. Never default a
   missing value to green, zero or "no problems".
4. **No secrets in the repo.** This repo is public. Tokens live only in environment variables
   (`GITHUB_TOKEN`, set in Vercel). Never commit a `.env*` file with values, log a token, put one in
   the snapshot JSON or print request headers.
5. **Untrusted text stays text.** PR titles, issue bodies, commit messages and report Markdown are
   written by others. Render them as React text, or through a sanitizing Markdown renderer with raw
   HTML off. Never use `dangerouslySetInnerHTML` on anything fetched.
6. **No copies of facts other repos own.** The repo registry is infra-config `config/repos.toml`
   plus gate `settings/github.toml`. This repo's `config/repos.json` only adds the repos neither
   names, with their group. Channel order, the canary schedule and probes are read from
   infra-config, never restated in code.
7. **User input never reaches a fetch.** A route parameter (`/repos/[repo]`) or filter (`since`) is
   checked against the registry or a fixed range before anything is fetched, and is never part of
   a URL, a GraphQL variable or a cache key. An unknown repo is a 404 that costs no API call.
8. **Never claim what you did not check.** In PRs and replies, say what you verified and how: the
   command and its output, a screenshot path or a URL. "Should work" is not a check.

## Stack

Decided by suraj (ask him before changing): **Next.js 16** (the org's "latest Next.js"),
**shadcn/ui** for all new UI, the **quirq brand**, **public repos**, **secrets only in environment
variables**.

Defaults chosen by this plan (change them in a PR that says why):

| Piece | Default | Notes |
|---|---|---|
| Next.js | 16.x, App Router, React Server Components | latest 16.x at scaffold time (innernet uses `^16.3.8`) |
| Language | TypeScript, `strict: true` | no `any` in `lib/` |
| Node | 24 LTS in CI | the org pin in infra-config `config/kinds.toml`; do not make `engines` strict, since cloud sessions run Node 22 |
| pnpm | pinned in `packageManager` | the org's promoted pnpm (11.28.2 in toolchains V0-TCH-02); commit `pnpm-lock.yaml` |
| UI | shadcn/ui new-york style, Tailwind CSS 4, `lucide-react` | |
| Validation | `zod`, one schema per source | parse, never cast |
| Tests | Vitest for `lib/`, Playwright for pages | Playwright pinned to `1.56.1` (see Checking your work) |
| Charts | plain SVG | no chart library in v0 (shadcn's chart wraps recharts) |
| Hosting | Vercel, production on push to `main`, previews on PRs | like `website`; suraj creates the project (README setup steps) |
| License | Apache-2.0 | like the qq infra repos; open question 4 in the README |

**This is not the Next.js you remember.** Next.js 16 changed APIs, caching and file conventions.
Before writing Next.js code, read the guide that ships with the installed version in
`node_modules/next/dist/docs/` and follow its deprecation notices over your training data. Check
especially how fetch caching and revalidation are declared, the async request APIs (`params`,
`headers`, `cookies`) and route handler conventions.

## Scaffolding (M0)

`create-next-app` refuses a folder that already holds `README.md`, `AGENTS.md` and `CLAUDE.md`, and
by default it overwrites `AGENTS.md` and `CLAUDE.md`. So:

1. Scaffold in a temporary directory outside the repo:
   `pnpm create next-app@16 /tmp/monitoring-scaffold --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm --no-agents-md --no-react-compiler --disable-git`.
   Explicit flags make every choice visible (any flag already skips the prompts). `--disable-git`
   matters most: without it the scaffold runs `git init` and commits in its own `.git`.
2. Copy everything except `.git`, `node_modules`, `README.md`, `AGENTS.md`, `CLAUDE.md` and
   `LICENSE` into the repo, then run `pnpm install` in the repo.
3. `next dev` adds a managed `<!-- BEGIN:nextjs-agent-rules -->` block to `AGENTS.md` when it
   detects an agent. Keep that block at the top of this file, as innernet does, and commit it with
   your change; removing it only makes `next dev` add it again.

**shadcn components without the registry.** Where `pnpm dlx shadcn@latest add <component>` works,
use it. In cloud sessions the shadcn registry (`ui.shadcn.com`) is blocked, so `shadcn init` and
`add` fail there. Instead:

- Add the npm dependencies: `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`,
  `tw-animate-css`, `lucide-react`.
- Copy each component from a sparse clone of `github.com/shadcn-ui/ui`
  (`apps/v4/registry/new-york-v4/ui/<component>.tsx`) into `components/ui/`, and change
  `from "cn"` to `from "@/lib/utils"`.
- Copy `lib/utils.ts` and the base CSS (the Tailwind 4 `@theme inline` block and theme variables)
  from research `infra/output/app/infra-map/src/lib/utils.ts` and `src/index.css`. They are a
  working Vite copy of the same setup.
- Keep shadcn's MIT license in `components/ui/LICENSE`, naming the shadcn commit you copied from,
  as research's copy does.

## Layout

```
app/
  layout.tsx             fonts, theme, header with wordmark
  page.tsx               Today
  waiting/page.tsx       Waiting on you
  board/page.tsx         Board
  release/page.tsx       Release
  health/page.tsx        Health
  repos/[repo]/page.tsx  Repo page
  api/snapshot/route.ts  GET only: the model as JSON
components/
  ui/                    shadcn, unmodified where possible
  state-badge.tsx        the one way to show a state
  source-link.tsx        "from <source>, <age> ago"
lib/
  sources/               one module per source
  model/                 Signals joined into the model
  github.ts              the only GitHub client
  fetch.ts               raw reads, zod helpers; the only other fetch
  signal.ts              the Signal type every source returns
config/
  repos.json             repos no registry names
  freshness.ts           window per writer job
  owner.ts               whose "waiting on you" it is (MONITORING_OWNER)
  demo.ts                planted records that are never counted
tests/
  live-check.ts          `pnpm live`: every source once against GitHub
  fixtures/              captured and synthetic files, with origin (README.md)
  fixtures/server.mjs    serves them like raw and the API; GET only
  sources/*.test.ts      each source, good and bad
  e2e/*.spec.ts          pages: phone, desktop, themes
```

Keep it this small. If a feature does not fit this shape, say so in the PR and ask before adding a
top-level directory, a state library, a database or a background worker.

## The source contract

Every module in `lib/sources/` exports one function that returns a `Signal`. Nothing else in the
app touches the network.

```ts
export type State = "green" | "red" | "held" | "pending" | "unknown" | "stale"

export type Signal<T> = {
  source: string       // stable id, e.g. "release/channels"
  sourceUrl: string    // the human link: the file on GitHub or the API page
  fetchedAt: string    // ISO time we read it
  observedAt?: string  // ISO time the data says it was written (updated_at, generated_at)
  ok: boolean          // false: value is absent and `reason` says why
  value?: T            // parsed and validated with the source's zod schema
  reason?: string      // one actionable line, e.g. "release-state: channels.json returned 404"
}
```

- **State-branch files** are read from
  `https://raw.githubusercontent.com/quirq-ai/<repo>/refs/heads/<branch>/<path>`. The `refs/heads/`
  form means a tag named like the branch is never served. No token is needed, but raw answers with
  `cache-control: max-age=300`, so a file can be up to 5 minutes old whatever our own cache says.
  Show "as of" times accordingly.
- **Validate with `zod`.** A file that does not match its schema is `ok: false` with the zod error
  summarized, never a partial value. Accept unknown extra fields. Where a file carries a `schema`
  id, refuse a different one (for example `qq-channels/2`) with a reason that says the dashboard
  needs updating. `scorecard.json` has no `schema` field: validate its shape only.
- **Timeouts.** 10 s per request. One failing source never breaks a page; its tiles show `unknown`.
- **GitHub API.** Always go through `lib/github.ts`. It sends the token only to `api.github.com`,
  reads the rate-limit headers, counts requests per hour, and returns
  `ok: false, reason: "GitHub API rate limit, resets at <time>"` instead of throwing. With no token
  it returns `ok: false, reason: "no token"` without calling.

### Freshness

Several writers commit only when something changed (gardener's tree-status, perf, the scorecard),
and tree-status files carry no timestamp. A file's age says when the state last *changed*, not
whether the writer is alive. So:

- **Is the writer alive?** comes from the writer workflow's last *completed* run on its default
  branch (`status=completed`), whatever triggered it (gardener's tree-status chains itself through
  dispatches, so do not filter to `schedule`). That is one cached API call per writer. Judge the
  run, not "last success": a workflow can fail after its writer job already published (gardener's
  tree-status fails on purpose when a main commit lacks a post-submit result, and its `next` job
  fails when it cannot dispatch; perf fails when records are refused).
  Fetch the last 10 completed runs (`per_page=10`, still one call) and skip any whose conclusion is
  `cancelled` or `skipped`: every writer queues runs in a concurrency group, and GitHub cancels the
  older pending one, so cancellation is routine. Judge the newest remaining run:
  - completed within the window with conclusion `success`: fresh;
  - completed within the window with any other conclusion: `red`, reason "<workflow> failed", with
    the run's link (the data may still be current; say so);
  - nothing completed within the window: `stale`, with the last run's link.
- **Since when?** comes from `observedAt` when the data has one (`updated_at`, `generated_at`,
  `finished_at`), and otherwise is not shown. Do not fetch a file's commit time per file.
- Windows per writer, in `config/freshness.ts`, each about two intervals plus slack:

| Writer workflow | Interval | Stale after |
|---|---|---|
| gardener `tree-status` | every 5 min | 20 min |
| release `lkgr` | every 10 min | 30 min |
| perf `perf` | :17 and :47 | 90 min |
| test-pipelines `scorecard` | every 6 h | 13 h |
| release `canary` | daily, schedule from infra-config `channels.toml` | 26 h after the scheduled time (derived, not restated) |
| release `canary-watchdog` | 09:43 and 13:43 daily | 26 h |
| rollers `roll-toolchains` | weekly, Monday 06:23 (cadence in infra-config `rollers.toml`) | 8 days |
| depot `e2e-sync` | daily 06:17 | 26 h |
| installer `live-manifest` | every 6 h at :17 | 13 h |

GitHub delays and sometimes drops scheduled runs on quiet repos, so `stale` means "look", not
"broken". If a writer's schedule changes, update this table and `config/freshness.ts` in one PR.

### API budget

Target, independent of visitor count: under 500 REST requests an hour (the token's limit is
5,000). Everything is REST; there is no GraphQL (decided in M1: GraphQL cannot be exercised from a
cloud session, and REST with the issue search covers the same questions in a handful of calls).

- Four org-wide `search/issues` calls, cached 120 s, each one request: every open PR
  (`is:pr is:open`), PRs merged in the last 7 days, PRs where the owner is a requested reviewer,
  and PRs the owner has reviewed. The search index can lag a change by a minute or two. For the
  reviewed PRs (a handful at most) one `pulls/<n>` plus one `pulls/<n>/reviews` call, cached
  600 s, tells whether the approval is on an older head. About 120 an hour plus the reviews.
- Two `search/issues` calls for the `canary-report` and `qq-failure` labels, cached 300 s.
  `qq-failure` issues are filed in more than one repo (release and test-pipelines today), so
  search the org, not one repo. About 24 an hour.
- One `commits/<branch>/check-runs` call per board repo, cached 600 s: about 180 an hour for 30
  repos. Deployments (`deployments` and the latest status) are read for products only.
- One `actions/workflows/<file>/runs` call per writer workflow (9), cached 300 s: about 108 an
  hour.
- Directory listings through the contents API, cached 300 s: test-pipelines `results` failures/
  (raw cannot list a directory), gardener `ledger` reverts/ and landed/, perf `perf-data` per
  product. The gardener `tree-status` commit log is `commits?sha=tree-status`, cached 300 s.
- The org repo list, cached 1 h: 1 an hour. The wiki's manifest is the no-token fallback:
  `https://raw.githubusercontent.com/quirq-ai/wiki/refs/heads/main/.quirq-wiki-manifest.json`.

`lib/github.ts` counts requests per hour (`requestsThisHour`) and the Health page shows the count.
Every request carries `per_page`; nothing paginates, so a list longer than a page is cut, which is
fine for a dashboard that shows the newest items.

## Sources

Verified on 2026-10-05 against the public branches. "raw" means the raw URL form above.

**Config (main branch, raw):**

| Source | Path | Gives |
|---|---|---|
| infra-config `repos` | `config/repos.toml` | products: kinds, channels, deploy target |
| infra-config `channels` | `config/channels.toml` | channel order, cadence, canary schedule |
| infra-config `health` | `config/health.toml` | probes and v0 signals |
| gate `settings` | `settings/github.toml` | `[[repo]]`: 13 infra repos plus xo-space and innernet |

**State branches (raw):**

| Source | Branch and path | Schema |
|---|---|---|
| release `channels` | `release-state`: `channels.json` | `qq-channels/1`: per repo and channel, commit, digest, generation, op, updated_at |
| release `pointers` | `release-state`: `pointers/<repo>/lkgr.json`, `pointers/<repo>/channels/<name>.json` | `qq-pointer/1`: history, `rolled_back`, `pending`, `mirrored` |
| release `canary runs` | `release-state`: `canary/<repo>/runs/<date>.json` | `qq-canary-run/1`: one `outcome` per repo per day (shipped, held, noop, error); `stages[]` carry `ok`, `ran`, `detail` |
| release `holds` | `release-state`: `canary/<repo>/held/<commit>.json` | hold record (none exist yet) |
| release `reports` | `release-state`: `reports/<date>.md` | Markdown, rendered as text |
| gardener `tree-status` | `tree-status`: `status/<repo>.json` | `qq-tree-status/1`: open, closed or unknown; red ranges; coverage |
| gardener `ledger` | `ledger`: `reverts/<id>.json`, `landed/<id>.json`, `failures/` | branch absent today: return `unknown: ledger not started` on 404 |
| test-pipelines `scorecard` | `results`: `scorecard.json` | no schema id; keep `not_measured` and `collect` visible |
| test-pipelines `failures` | `results`: `failures/` | `quirq-results/1` |
| perf `perf-data` | `perf-data`: `<repo>/<metric>.jsonl` | `qq-perf-record/1`, one per line |

**GitHub API (token):** `search/issues` for PRs and for the `canary-report` and `qq-failure`
labels, `pulls/<n>` and its reviews, `check-runs`, `deployments` (Vercel's appear here: confirmed
on monitoring and innernet in M1), `workflow runs` of the writers above, `contents` listings and
`org repos`.

Filter out demo records: the only failure record on `results` today is a planted demo
(`canary-held-aefebec4c11f668b`). Records carry no demo flag; the demo is recognised by its
`subject: planted-canary-demo-v0` (written by test-pipelines `failure-demo.yml`). Keep the list of
demo subjects in one constant; demo records never count toward "waiting on you".

## Keeping it simple

- One page answers one question from the README. If a page needs a paragraph to explain, split it
  or cut it.
- Show the state word first, then the detail, then the link. Commits are 7-character SHAs in
  JetBrains Mono, linked to the full commit. Times read "4 min ago", with the exact UTC time in the
  title attribute; phones have no hover, so the repo page shows exact times.
- One `StateBadge` component for every state, everywhere. It never uses shadcn's `destructive`
  variant. Stock shadcn Button and Badge hard-code `text-white` on `destructive`; when you copy
  them, change that to `text-destructive-foreground`, drop the `dark:bg-destructive/60` overlay
  (with it, dark text is only 3.5:1), and add `--color-destructive-foreground:
  var(--destructive-foreground)` to the `@theme inline` block, or the class applies no color. Colors
  come from CSS variables, never hex in components.
- Numbers before charts. A chart only for a trend (canary strip, perf history), in plain SVG.
- No popup, dialog or popover that scrolls; detail belongs on a page. A Sheet on a phone is fine
  only if it fits without scrolling.
- Do not reuse PostHog's site design or assets (website was derived from it and its UI is being
  replaced). The look comes from the quirq brand below.

## Brand and themes

- **Logo.** Copy `wordmark.svg`, `mark.svg` and `app-icon.svg` from innernet `public/brand/quirq/`
  into `public/brand/quirq/` unchanged, and note the source commit in the PR.
- **Colors.** Map xo-space `space_ui/css/themes.css` onto shadcn's tokens in `app/globals.css`.
  Dark is the `quirq` theme (lines 7-25). Light is the `linen` theme (lines 62-80; its
  `--chart-*` values are on lines 75-76).

| shadcn token | xo-space token | Why |
|---|---|---|
| `--background` | `--bg` | |
| `--card`, `--popover` | `--bg-2` | |
| `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--accent-foreground` | `--ink` | |
| `--accent` (shadcn's hover surface, not the brand accent) | `--bg-3` | |
| `--muted`, `--secondary` | `--bg-3` | |
| `--foreground` | `--ink` | |
| `--muted-foreground` | `--ink-3` | 7.90:1 dark, 5.40:1 light |
| `--border`, `--input` | `--ink-4` | `--line` is only 1.52:1 dark and 1.39:1 light; `--ink-4` is 4.61-5.40:1 dark and 3.64-4.29:1 light on `--bg`/`--bg-2`/`--bg-3` |
| `--ring` | `--focus-line` | |
| `--primary` | `--accent` | |
| `--primary-foreground` | `--accent-ink` | 9.21:1 dark, 5.59:1 light |
| `--destructive` | `--err` | |
| `--destructive-foreground` | dark `#21141e` (`--accent-ink`), light `#ffffff` | white on dark `--err` is only 2.23:1; these give 7.95:1 and 6.37:1 |
| `--chart-1` to `--chart-5` | `--chart-1` to `--chart-5` | |

Use `--line` only for purely decorative dividers that carry no meaning; anything that outlines a
control, a card edge you rely on, or a state uses `--border`. Add state tokens (`--state-green`,
`--state-red`, `--state-held`, `--state-pending`, `--state-unknown`) and check each against all
three backgrounds in both themes.

- **Fonts.** Poppins 600 for headings, Inter for text, JetBrains Mono for code and numbers, through
  `next/font` (self-hosted at build time, no runtime font requests).
- **Theme.** Follows `prefers-color-scheme`, with a toggle stored in a cookie so the server renders
  the right theme with no flash.

## Milestones

Each milestone is one PR (split it if the diff passes about 600 lines), titled `M<n>: <what>`,
opened as a draft, and done only when its "done when" holds and is shown in the PR.

| # | What | Done when |
|---|---|---|
| M0 | Scaffold (steps above): TypeScript strict, pnpm, Tailwind 4, shadcn components and tokens, fonts, header with wordmark, theme toggle, CI workflow | CI green; `pnpm build && pnpm start` serves the empty shell, and Playwright screenshots at 390 and 1280 px in light and dark are in the PR; contrast tests for text, borders and state tokens pass. The Vercel project is suraj's step, not part of done |
| M1 | `lib/github.ts` and every source above, with fixtures | tests for good, missing (404), malformed and stale input per source; a test fails on any non-GET method or GraphQL mutation; no token in any test output |
| M2 | `lib/model` and `GET /api/snapshot` | the snapshot validates against its own zod schema (`qq-monitoring-snapshot/1`); one source down turns its part `unknown` and the rest renders; no token or header in it |
| M3 | Today and Waiting on you | against fixtures, a merged PR, an lkgr move, a held canary and a new failure each appear once with a working link; the three counts match; the demo failure record is not counted |
| M4 | Board and Repo page | every repo from the three registries appears once; a repo in the org list but no registry shows the notice; `/repos/<unknown>` is a 404 with no API call |
| M5 | Release and Health | the channel board matches `channels.json`; the canary strip matches `canary/<repo>/runs/`; a writer past its window shows `stale` |
| M6 | Polish and audit | Playwright screenshots of every page, phone and desktop, light and dark, in the PR; axe reports no serious issues; Lighthouse accessibility at least 95 |

**Fixtures.** Capture real files from the state branches and record the branch and commit they came
from in `tests/fixtures/README.md`. Two sources have no real file yet: build the hold record from
release `src/qqrelease/canary.py` (`held_path` and the hold record it writes) at `581fdf2`, and the
ledger records from gardener `src/qqgarden/ledger.py` at `bf7d24d`. Mark both as synthetic, never
as captured.

## Checking your work

Run before every push, and paste the result in the PR:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test          # vitest
pnpm build
pnpm e2e           # playwright: 390x844 and 1280x800, light and dark
pnpm live          # every source once against the real branches; paste the summary
```

- **Fixtures, not the network.** Tests and the Playwright run point the sources at
  `tests/fixtures/server.mjs` through `MONITORING_RAW_BASE` and `MONITORING_API_BASE`, with a
  dummy `GITHUB_TOKEN` that only ever reaches loopback. The server renders `{{now-5m}}` and
  `{{today}}` tokens per request, so freshness and ages stay meaningful. `tests/fixtures/README.md`
  names where each file came from; a synthetic file is always marked as such.
- **Live check in a cloud session.** Node's `fetch` ignores the proxy unless `NODE_USE_ENV_PROXY=1`
  is set, and the session's GitHub access covers only its configured repositories (other repos
  and `search/issues` answer 403 there, not on Vercel). Run
  `NODE_USE_ENV_PROXY=1 pnpm live` and say in the PR which rows could not be checked from there.
- **Playwright version.** Cloud sessions ship Chromium for Playwright 1.56.1 in `/opt/pw-browsers`
  and must not download browsers, so pin `@playwright/test` to `1.56.1`. When you bump it, read
  the executable path from an environment variable (`PW_CHROMIUM_PATH`) in the config so local
  sessions keep working. CI runs `pnpm exec playwright install --with-deps chromium`.
- **CI workflow.** `permissions: contents: read` at the top, every action pinned by full commit SHA
  with the version in a comment (as infra-config `config/kinds.toml` does), no secrets.
- **Contrast.** Text at least 4.5:1; borders, inputs and state markers at least 3:1; in both themes,
  against `--background`, `--card` and `--muted`. The e2e suite checks all of these from the
  computed CSS variables. Never lower a limit to pass.
- **Screenshots.** For any UI change, attach phone and desktop screenshots in light and dark. suraj
  reads on his phone, so the phone shots matter most. `pnpm e2e` writes them to the ignored
  `test-results/screenshots/`, and CI uploads that folder as the `screenshots` artifact; never
  commit them.
- **Real data.** Before calling a source done, run it once against the live branch and show a
  summary in the PR (counts and states, not whole files).
- **Adversarial reread.** Before pushing, reread the diff and ask: does anything write, leak a
  token, render fetched HTML, call the network outside `lib/sources`, let user input reach a fetch,
  or show green for missing data? Fix it first.

## Working here

- Every change is a pull request against `main`, squash-merged with CI green. Keep PRs small: one
  milestone or less each.
- Keep README and AGENTS.md true. If a source path, schedule, feature or rule changes, the same PR
  updates them.
- Mark a decision you cannot make with a one-line `TODO(suraj):` in the code or the PR, and keep
  going on the safe default.
- Other repos are read from here, never changed. If the dashboard needs data another repo does not
  publish yet, propose it to that repo in its own PR instead of scraping around it.
- Environment variables: `GITHUB_TOKEN` (optional, read-only), `MONITORING_ORG` (default
  `quirq-ai`), `MONITORING_OWNER` (the login "waiting on you" is about, default `sharmasuraj0123`),
  and for tests only `MONITORING_RAW_BASE` and `MONITORING_API_BASE` (the fixture server). Document
  any new one here and in `.env.example` with an empty value.
