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
  (today)/page.tsx       Today (a route group, so it has its own loading.tsx)
  waiting/page.tsx       Waiting on you
  board/page.tsx         Board
  release/page.tsx       Release
  health/page.tsx        Health
  repos/[repo]/page.tsx  Repo page
  api/snapshot/route.ts  GET only: the model as JSON
components/
  ui/                    shadcn, unmodified where possible
  state-badge.tsx        the one way to show a state (a dot in the state color, then the word)
  api-banner.tsx         one Alert when the GitHub API as a whole is out
  markdown.tsx           react-markdown with raw HTML off, for the canary report
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
- **Read times.** `fetchedAt` is the response's own `Date` header, which the data cache keeps, not
  the render time: Next serves an expired entry once while it refreshes in the background, so after
  a quiet night the first render carries last night's data. Every signal also carries `maxAge` (its
  cache window); the model marks a green or pending cell `stale` when its source was read more than
  twice its window ago. `reads` says per page (Today, Waiting, Board) when its own sources were
  last read (`asOf`, absent when none answered, so the page says "No data could be read" rather
  than "just now") and whether any read is past twice its window (`stale`, shown on the count tiles
  and over the lists). The registries are left out: the hourly org list says nothing about how
  fresh the PRs or the files are.
- **Facts are not states.** A cell whose text is a known fact with no health in it ("nothing merged
  in 7 days", "no deployments", "nothing promoted yet", "not in the canary yet") has state `none`:
  plain text, no badge, never counted. `green` means healthy, not "a thing exists". A product with
  no channels in infra-config is outside the canary, so no lkgr pointer is read for it.
- **The newest event per subject is the current one.** Today marks an older tree, canary or deploy
  event `superseded` when a newer one exists for the same repo (`markSuperseded`), so "tree
  closed" at 09:00 leaves "Needs a look" once "tree open" lands at 10:00; it stays in the
  timeline marked "since cleared" when the newer event is green (`cleared`), and unmarked when
  the newer event is another alarm. A writer whose last run failed is a "Needs a look" item that
  opens Health, and counts in the third tile ("unknown, stale or failing") with the unreadable
  sources and the stale writers; "red or held" counts Board cells only, since it opens the Board.
- **Writers gate their files.** A tree, lkgr or canary cell is only as current as the job that
  writes the file (`gateByWriter` in `lib/model/build.ts`): when gardener `tree-status`, release
  `lkgr` or release `canary` is stale, red or unknown, a green or pending cell becomes stale or
  unknown and says so (with the writer's reason shortened to "no token" or "rate limited" where
  the banner explains it). Red and held cells stay, since the file's alarm is real whatever
  happened since.
- **Back-off.** `lib/github.ts` keeps the rate-limit reset time in module memory (trusted for at
  most an hour, so a bad header cannot pin the state) and answers "rate limit" without calling
  until then; an endpoint that answered 5xx or not at all is not asked again for one minute (per
  URL, never globally: one 502 from one search must not blank the other cells, and a 5xx reaches
  the client only when the data cache had nothing to serve, so the wait hides no cached data), with
  the reason and the retry time in that cell; both clients remember a 404 for the source's window,
  since Next caches only 200s. Tests call `forgetBackoff()` between cases (`withFixtures` does).
- **One banner.** `health.api` says whether the API as a whole answers (`ok`, `no-token`,
  `rate-limited`, `token-rejected`, `down`); every page shows it as one Alert whose description
  does not repeat its title, and API cells then say just `unknown: no token` or `rate limited`,
  carrying `because: "api"` (`isApiOutageReason`: no token, rate limit, rejected token, a wait
  after a 5xx; never a 404, a bad body or a refused name, which are the row's own). A Board row
  whose only unknowns are that cause is `quiet`, and the phone Board folds it to one line while
  the banner is up, so a token outage reads as one line, not thirty open cards.
- **GitHub API.** Always go through `lib/github.ts`. It sends the token only to `api.github.com`,
  reads the rate-limit headers, counts requests per hour, and returns
  `ok: false, reason: "GitHub API rate limit, resets at <time>"` instead of throwing. With no token
  it returns `ok: false, reason: "no token"` without calling. A 403 that is not the primary rate
  limit (`x-ratelimit-remaining: 0`) carries GitHub's own `message` from the body, one line cut at
  120 characters ("GitHub API refused (403): Resource not accessible by personal access token"),
  so Health shows GitHub's reason, whatever it is: a missing permission, or a secondary rate limit
  ("You have exceeded a secondary rate limit", remaining above 0, sometimes with a `retry-after`
  header), which today takes the same path with no back-off (listed under "What is not built" in
  the README: treat such a 403 as rate limited). Such a reason is the row's own
  and does not fold the row as quiet; the banner repeats it only when every GitHub read fails.

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
  - only runs on the writer's default branch count (`branch=main` in the request, and the run's
    `head_branch` checked again), so a pull-request run of depot `e2e-sync` never reads as alive;
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
| release `canary` | daily, schedule from infra-config `channels.toml` | 26 h (fixed in `config/freshness.ts`, not yet derived from the schedule) |
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
  (raw cannot list a directory), gardener `ledger` reverts/ and landed/, and release
  `canary/<repo>/runs/` per product in the canary (a product with no channels has no run files by
  design, so none is listed or probed for it), so only the days that have a file are read (raw
  answers 404 for the rest, which Next never caches). Without a token the days are probed one by
  one instead; a refused or malformed listing is a source failure on Health
  (`release/canary-listing/<repo>`, with "days read one by one" in its reason) and the days are
  probed. The gardener `tree-status` commit log is `commits?sha=tree-status`, cached 300 s.
- The perf `perf-data` listing per product, cached 1 h, and each metric file read raw, cached
  600 s: on the repo page, and on Health so a refused or malformed file is seen. Perf decides on
  its own which products it measures, so a product with no directory there (a plain "Not Found"
  404) is "not measured": an empty list on the repo page and no row on Health, never an unknown.
  A 404 whose message says the ref is missing is the `perf-data` branch gone, and is a failure
  with that message (`lib/github.ts` keeps GitHub's message with a 404; the same rule tells a
  missing `canary/<repo>/runs/` directory from a missing `release-state` branch).
- The org repo list, cached 1 h: 1 an hour. The wiki's manifest is the no-token fallback:
  `https://raw.githubusercontent.com/quirq-ai/wiki/refs/heads/main/.quirq-wiki-manifest.json`.

Lists are cut at their page size and say so: an open-PR count is a floor ("3+") when the search
had more than 100 results, and a head with more than 50 check runs rolls up `unknown`.

`lib/github.ts` counts the client's calls per hour (`requestsThisHour`, per server process, and a
call the Data Cache answers is counted too) and the Health page shows the count. A model test
asserts that one cold render of every page makes at most 70 API requests against the fixture
server, so a new per-repo call cannot slip in unnoticed. Every request carries `per_page`; nothing
paginates, so a list longer than a page is cut, which is fine for a dashboard that shows the newest
items.

## Sources

Verified on 2026-10-05 against the public branches. "raw" means the raw URL form above.

**Config (main branch, raw):**

| Source | Path | Gives |
|---|---|---|
| infra-config `repos` | `config/repos.toml` | products: kinds, channels, deploy target |
| infra-config `channels` | `config/channels.toml` | channel order, cadence, canary schedule |
| infra-config `health` | `config/health.toml` | probes and v0 signals (not read yet: no module in `lib/sources/` reads it) |
| gate `settings` | `settings/github.toml` | `[[repo]]`: 13 infra repos plus the products xo-space, innernet and website (file as of gate 2a73334, 2026-10-06; website merged there, not yet applied) |

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
labels, `pulls/<n>` and its reviews, `check-runs`, `deployments` (Vercel's appear here as environment `Production`:
confirmed with `pnpm live` on monitoring and innernet in M1), `workflow runs` of the writers above, `contents` listings and
`org repos`.

Filter out demo records: the only failure record on `results` today is a planted demo
(`canary-held-aefebec4c11f668b`). Records carry no demo flag; the demo is recognised by its
`subject: planted-canary-demo-v0` (written by test-pipelines `failure-demo.yml`). Keep the list of
demo subjects in one constant; demo records never count toward "waiting on you".

## Keeping it simple

- One page answers one question from the README. If a page needs a paragraph to explain, split it
  or cut it.
- Show the state word first, then the detail, then the link. Commits are 7-character SHAs in
  Geist Mono, linked to the full commit. Times read "4 min ago", with the exact UTC time in the
  title attribute; phones have no hover, so the repo page shows exact times.
- One `StateBadge` component for every state, everywhere: a dot in the state color (the 3:1
  marker; `unknown` is an outlined dot, so a missing value never looks like a quiet one) and the
  state word in the text color, on a quiet muted pill so a badge inside a sentence does not run
  into the words after it; `StateDot` is the dot alone, for the count tiles. Health's Sources list
  says "ok" on a plain pill with no state color for a read that answered (readable is not healthy,
  and every API read comes through the data cache, so never fresh either); a read older than twice
  its cache window is the `stale` badge with "read N ago". It never uses shadcn's `destructive`
  variant. Stock shadcn Button and Badge hard-code `text-white` on `destructive`; when you copy
  them, change that to `text-destructive-foreground`, drop the `dark:bg-destructive/60` overlay
  (with it, dark text is only 3.5:1), and add `--color-destructive-foreground:
  var(--destructive-foreground)` to the `@theme inline` block, or the class applies no color. The
  copied Button's focus ring is `ring-ring`, not stock `ring-ring/50` (2:1 on a ghost button).
  Colors come from CSS variables, never hex in components.
- Numbers before charts. A chart only for a trend (canary strip, perf history), in plain SVG.
- No popup, dialog or popover that scrolls; detail belongs on a page. A Sheet on a phone is fine
  only if it fits without scrolling.
- Phone first: what needs a look comes first (Today's "Needs a look", the Board's row order by
  worst state), and a green or quiet non-product repo on the Board is one line that opens on tap
  (Collapsible), a run of such lines sharing one card. Every page segment has a `loading.tsx`
  (Skeleton) except the repo page, where a Suspense boundary would stream a 200 before
  `notFound()` can answer 404; `app/error.tsx` shows
  one fixed sentence and the digest (production replaces the message with a minified one) and
  offers a retry. A page cannot set a 503, so a repo whose registries could not be read is a 200
  that says "could not be looked up"; `notFound()` is the only status a page can choose.
- Fetched Markdown: a table in the report sits in a scroll box with `tabIndex=0`, `role="region"`
  and a label, so a keyboard can reach it; images are not fetched (alt text only), so no outside
  host learns a viewer's address.
- Tap targets are at least 44 px tall on a phone (nav links, the theme toggle, the window links).
- Do not reuse PostHog's site design or assets (website was derived from it and its UI is being
  replaced). The look comes from the Brand and themes section below.

## Brand and themes

- **Logo.** Copy `wordmark.svg`, `mark.svg` and `app-icon.svg` from innernet `public/brand/quirq/`
  into `public/brand/quirq/` unchanged, and note the source commit in the PR.
- **Look.** Vercel's: suraj asked for it on 2026-10-07 ("sleek, professional, modern Vercel-type
  UI"), on shadcn components. Near-monochrome surfaces and text, hairline dividers, color only for
  the six states; a compact sticky header with the wordmark, a "/ Monitoring" label and underlined
  tabs; stat tiles with the label above a large tabular number. The sticky header needs
  `scroll-padding-top` on `<html>`, or a focused element can land under it (WCAG 2.4.11). Before
  2026-10-07 the palette was mapped from xo-space's `quirq` and `linen` themes
  (`space_ui/css/themes.css`); see this file at e148ad9 for that mapping.
- **Colors.** The tokens live in `app/globals.css`, in three blocks the contrast test parses:
  light (`:root`), dark (`:root[data-theme="dark"]`) and dark-system (inside the
  `prefers-color-scheme: dark` media query), the last two identical.

| shadcn token | light | dark | Why |
|---|---|---|---|
| `--background` | `#fafafa` | `#000000` | the page |
| `--card`, `--popover` | `#ffffff` | `#0a0a0a` | a card sits a step above the page |
| `--muted`, `--secondary`, `--accent` (shadcn's hover surface) | `#f2f2f2` | `#1a1a1a` | |
| `--foreground`, `--card-foreground` and the other foregrounds | `#171717` | `#ededed` | |
| `--muted-foreground` | `#666666` | `#a1a1a1` | 5.1:1 light and 6.7:1 dark on `--muted`, the worst case |
| `--border`, `--input` | `#858585` | `#7d7d7d` | at least 3.3:1 light and 4.2:1 dark on every surface |
| `--line` | `#ebebeb` | `#262626` | decorative hairlines only; 1.1:1 to 1.4:1, never a control's edge |
| `--primary` / `--primary-foreground` | `#171717` / `#ffffff` | `#ededed` / `#0a0a0a` | |
| `--destructive` / `--destructive-foreground` | `#cc1f1a` / `#ffffff` | `#ff6166` / `#0a0a0a` | |
| `--ring` | `#0070f3` | `#52a8ff` | |
| `--state-green`, `-red`, `-held`, `-pending`, `-unknown`, `-stale` | `#0f7a3e`, `#cc1f1a`, `#b45309`, `#0070f3`, `#666666`, `#6d28d9` | `#3ecf8e`, `#ff6166`, `#f5a623`, `#52a8ff`, `#a1a1a1`, `#b48cff` | markers, at least 3:1 on every surface |
| `--chart-1` to `--chart-5` | pending, green, held, stale, red | the same | |

Use `--line` only for purely decorative dividers that carry no meaning (list rows, the header
rule, table rows); anything that outlines a control, a card edge you rely on, or a state uses
`--border`. Check every state token against all three backgrounds in both themes; the tests do.

- **Fonts.** Geist Sans for all text (headings semibold, tightened), Geist Mono for ids and
  source names, from the `geist` package through `next/font/local` (self-hosted at build time, no
  runtime font requests). Numbers are Geist Sans with `tabular-nums`.
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
  and for tests only `MONITORING_RAW_BASE` and `MONITORING_API_BASE` (the fixture server) and
  `PW_CHROMIUM_PATH` (Playwright's Chromium, for local runs). Document any new one here and in
  `.env.example` with an empty value.
