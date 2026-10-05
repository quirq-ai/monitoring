# Agent guide

How an agent builds and changes the quirq-ai monitoring dashboard. Read [`README.md`](README.md)
first: it says what the dashboard is for, what it reads and what it must look like. This file says
how to build it so it stays simple, and how to prove each change before asking for review.

## The rules that do not bend

1. **Read-only.** The dashboard never writes to GitHub or anywhere else: no merges, approvals,
   comments, dispatches, ref moves or issue edits. No code path may call a GitHub endpoint with a
   method other than `GET` (GraphQL: queries only, no mutations). A test enforces this (M1).
2. **Bound to the source.** Every value on screen comes from exactly one source module in
   `lib/sources/`, carries that source's URL and fetch time, and links to it. Pages never call
   `fetch` or the GitHub API directly.
3. **Missing is never green.** A source that fails, times out, does not parse, or is older than its
   freshness limit yields `unknown` or `stale` with a one-line reason. Never default a missing
   value to green, zero, or "no problems".
4. **No secrets in the repo.** This repo is public. Tokens live only in environment variables
   (`GITHUB_TOKEN`, set in Vercel). Never commit a `.env*` file with values, never log a token,
   never put one in the snapshot JSON, never print request headers.
5. **Untrusted text stays text.** PR titles, issue bodies, commit messages and report Markdown are
   written by others. Render them as React text or through a sanitizing Markdown renderer with raw
   HTML off. No `dangerouslySetInnerHTML` on anything fetched.
6. **No copies of facts other repos own.** The repo registry is infra-config `config/repos.toml`
   plus gate `settings/github.toml`; this repo's `config/repos.json` only adds repos neither names
   and the group they show in. Channel order, schedules and probes are read from infra-config,
   not restated in code.
7. **Never claim what you did not check.** In PRs and replies, say what you verified and how
   (command and output, a screenshot path, a URL). "Should work" is not a check.

## Stack (decided; ask suraj before changing any of it)

| Piece | Choice | Notes |
|---|---|---|
| Framework | Next.js 16, App Router, React Server Components | latest 16.x at scaffold time (innernet uses `^16.3.8`) |
| Language | TypeScript, `strict: true` | no `any` in `lib/` |
| Runtime | Node 24 LTS | the org pin in infra-config `config/kinds.toml` |
| Package manager | pnpm, version pinned in `packageManager` | like innernet and website; commit `pnpm-lock.yaml` |
| UI | shadcn/ui (new-york style), Tailwind CSS 4, `lucide-react` | project rule: shadcn unless suraj names another library |
| Validation | `zod` schemas, one per source | parse, never cast |
| Tests | Vitest for `lib/`, Playwright for pages | Chromium is preinstalled in cloud sessions; do not run `playwright install` there |
| Hosting | Vercel, production on push to `main`, previews on PRs | same as `website` |

**This is not the Next.js you remember.** Next.js 16 changed APIs, caching and file conventions.
Before writing Next.js code, read the guide that ships with the installed version in
`node_modules/next/dist/docs/` and follow its deprecation notices over your training data. Check
especially: how fetch caching and revalidation are declared, async request APIs (`params`,
`headers`, `cookies`), and route handler conventions.

**Getting shadcn components.** Use `pnpm dlx shadcn@latest add <component>` where the network
allows it. Where the shadcn registry is blocked (cloud sessions behind the agent proxy), copy the
component source from a sparse clone of `github.com/shadcn-ui/ui`
(`apps/v4/registry/new-york-v4/ui/<component>.tsx`), fix its imports to `@/lib/utils`, and keep
shadcn's MIT license file next to the components. research's
`infra/output/app/infra-map/src/components/ui/` is a working example of exactly this.

## Layout

```
app/
  layout.tsx            fonts, theme provider, header with the quirq wordmark
  page.tsx              Today (what changed, three counts)
  waiting/page.tsx      Waiting on you
  board/page.tsx        Board (one row per repo)
  release/page.tsx      Release (lkgr, channels, canary strip, report)
  health/page.tsx       Health (tree status, scorecard, machinery freshness)
  repos/[repo]/page.tsx Repo page
  api/snapshot/route.ts GET only: the model as JSON (qq-monitoring-snapshot/1)
components/
  ui/                   shadcn components, unmodified where possible
  state-badge.tsx       the one way to show a state (word + icon + color)
  source-link.tsx       "from <source>, <age> ago" with the link
  ...                   small composed pieces; no page-specific logic here
lib/
  sources/              one module per source (contract below)
  model/                joins Signals into Repo, Change, Channel, Freshness, Snapshot
  github.ts             the only GitHub client: GET only, token from env, rate-limit aware
config/
  repos.json            repos no registry names, their group, and `hidden`
  freshness.ts          freshness limit per source (README "Where the state comes from")
tests/
  fixtures/             real files captured from the state branches, with the commit they came from
  sources/*.test.ts     each source against its fixtures, including broken and missing input
  e2e/*.spec.ts         Playwright: every page, phone and desktop, light and dark
```

Keep it this small. A new feature fits into this shape; if it does not, say so in the PR and ask
before adding a new top-level directory, a state library, a database or a background worker.

## The source contract

Every module in `lib/sources/` exports one function that returns a `Signal`. Nothing else in the
app touches the network.

```ts
export type State = "green" | "red" | "held" | "pending" | "unknown" | "stale"

export type Signal<T> = {
  source: string        // stable id, e.g. "release/channels"
  sourceUrl: string     // the human link: the file on GitHub or the API page
  fetchedAt: string     // ISO time we read it
  observedAt?: string   // ISO time the source says it was written (updated_at, generated_at)
  ok: boolean           // false: value is absent and `reason` says why
  value?: T             // parsed and validated with the source's zod schema
  reason?: string       // one line a person can act on: "release-state: channels.json returned 404"
}
```

- Read state-branch files from
  `https://raw.githubusercontent.com/quirq-ai/<repo>/refs/heads/<branch>/<path>` (the
  `refs/heads/` form, so a tag named like the branch is never served). No token needed.
- Validate with `zod`. A file that does not match its schema is `ok: false` with the zod error
  summarized, never a partial value. Accept unknown extra fields; refuse a different `schema` id
  (e.g. `qq-channels/2`) with a reason that says the dashboard needs updating.
- Each source declares its cache time and freshness limit. Freshness is computed from
  `observedAt` when the source has one, else from the commit time of the file.
- Timeouts: 10 s per request. One failing source never breaks a page; its tiles show `unknown`.
- GitHub API: go through `lib/github.ts`. It sends the token only to `api.github.com`, reads the
  rate-limit headers, and returns `ok: false, reason: "GitHub API rate limit, resets at <time>"`
  instead of throwing. Prefer one GraphQL query per page over many REST calls.

Sources to implement in M1 (paths verified in README): infra-config `repos`, `channels`,
`health`; gate `settings`; release `channels.json`, `pointers`, `canary runs`, `holds`, `reports`;
gardener `tree-status`, `ledger` (absent today: must return `unknown: ledger not started`);
test-pipelines `scorecard`, `failures`; perf `perf-data`; GitHub `pulls`, `checks`, `deployments`,
`workflow runs`, `issues` (labels `canary-report`, `qq-failure`), `org repos`.

## Keeping it simple

- One page answers one question from the README. If a page needs a paragraph to explain, split it
  or cut it.
- Show the state word first, then the detail, then the link. Commits as 7-character SHAs in
  JetBrains Mono, linked to the full commit; times as "4 min ago" with the exact UTC time on hover
  and in the title attribute (phones have no hover, so the repo page shows exact times).
- One `StateBadge` component for every state, everywhere. Colors come from CSS variables, never
  hard-coded hex in components.
- Numbers before charts. A chart only for a trend (canary strip, perf history), drawn with plain
  SVG or a shadcn chart; no heavy chart library in v0.
- No popup, dialog or popover that scrolls; detail belongs on a page (Sheet on phones is fine if
  it fits without scrolling).
- Do not reuse PostHog's site design or assets (website was derived from it; its UI is being
  replaced). The look comes from the quirq brand below.

## Brand and themes

- Logo: copy `wordmark.svg`, `mark.svg` and `app-icon.svg` from innernet `public/brand/quirq/`
  into `public/brand/quirq/`, unchanged, and note the source commit in the PR.
- Colors: map xo-space `space_ui/css/themes.css` onto shadcn's tokens in `app/globals.css`.
  Dark = the `quirq` theme (lines 7-25), light = the `linen` theme (lines 62-74). Map `--bg` to
  `--background`, `--bg-2` to `--card`, `--ink` to `--foreground`, `--ink-3` to
  `--muted-foreground`, `--line` to `--border`, `--accent` to `--primary`, `--accent-ink` to
  `--primary-foreground`, `--err` to `--destructive`, `--chart-1..5` to `--chart-1..5`. Add state
  tokens (`--state-green`, `--state-red`, `--state-held`, `--state-pending`, `--state-unknown`)
  and check each against both backgrounds.
- Fonts: Poppins 600 for headings, Inter for text, JetBrains Mono for code and numbers, via
  `next/font` (self-hosted at build time, no runtime font requests).
- Theme follows `prefers-color-scheme`, with a toggle stored in a cookie so the server renders
  the right theme with no flash.

## Milestones

Each milestone is one PR (split further if the diff passes about 600 lines), titled
`M<n>: <what>`, opened as a draft, and done only when its "done when" holds and is shown in the PR.

| # | What | Done when |
|---|---|---|
| M0 | Scaffold: Next.js 16, TypeScript strict, pnpm, Tailwind 4, shadcn init, brand tokens and fonts, header with wordmark, theme toggle, CI workflow (`lint`, `typecheck`, `test`, `build`), Vercel project linked | CI green; preview URL renders an empty shell in light and dark at 390 px and 1280 px; contrast check passes |
| M1 | `lib/github.ts` and every source in the list above, with fixtures captured from the real branches | each source has tests for good, missing (404), malformed and stale input; a test fails if any code calls a non-GET method or a GraphQL mutation; no token appears in any test output |
| M2 | `lib/model` and `GET /api/snapshot` | snapshot validates against its own zod schema; a source down turns its part `unknown` and the rest still renders; snapshot contains no token or header |
| M3 | Today and Waiting on you | against fixtures: a merged PR, an lkgr move, a held canary and a new failure each appear once with a working link; the three counts match |
| M4 | Board and Repo page | every repo from the three registries appears once; a repo in the org list but in no registry shows the "not in any registry" notice |
| M5 | Release and Health | channel board matches `channels.json`; canary strip matches `canary/<repo>/runs/`; machinery freshness flags a job past its window |
| M6 | Polish and audit | Playwright screenshots of every page, phone and desktop, light and dark, attached to the PR; axe check has no serious issues; Lighthouse accessibility at least 95 |

## Checking your work

Run before every push, and paste the result in the PR:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test          # vitest
pnpm build
pnpm e2e           # playwright: phone 390x844 and desktop 1280x800, light and dark
```

- **Contrast.** Text at least 4.5:1, borders and state markers at least 3:1, in both themes. The
  e2e suite checks the state tokens and body text against their backgrounds; do not lower a limit
  to pass.
- **Screenshots.** For any UI change, attach phone and desktop screenshots in light and dark.
  suraj reads on his phone: the phone shots matter most.
- **Real data.** Before calling a source done, run it once against the live branch and show the
  output summary in the PR (counts and states, not whole files).
- **Adversarial reread.** Before pushing, reread the diff asking: does anything write, leak a
  token, render fetched HTML, call the network outside `lib/sources`, or show green for missing
  data? Fix it first.

## Working here

- Every change is a pull request against `main`, squash-merged, with CI green. Small PRs, one
  milestone or less each.
- Keep README and AGENTS.md true: if a source path, schedule, feature or rule changes, the same PR
  updates them.
- Mark a decision you cannot make with a one-line `TODO(suraj):` in the code or the PR, and keep
  going on the safe default.
- Other repos are read, never changed, from here. If the dashboard needs a source another repo
  does not publish yet (for example a JSON form of something only in an issue), propose it to that
  repo in its own PR; do not scrape around it.
- Environment variables: `GITHUB_TOKEN` (optional, read-only), `MONITORING_ORG` (default
  `quirq-ai`). Document any new one here and in `.env.example` with an empty value.
