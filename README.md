# monitoring

The quirq-ai monitoring dashboard: one place to see **what changed across the org and what state
everything is in**, on a phone or a desktop.

This repo holds the plan only. Nothing is built yet. This README is the plan for people (what the
dashboard is, what it reads, how it looks, in what order it gets built); [`AGENTS.md`](AGENTS.md)
is the plan for the agents that build it (stack, rules, layout, milestones, how to check their
work). Both are kept true as the dashboard is built: a PR that changes the plan changes these files.

## Why it exists

quirq-ai now has about twenty repos, most of them changed by agents, several times a day. Changes
land through merge queues, a daily canary ships builds, a gardener watches main, perf records
numbers, and each of these keeps its state on its own branch in its own repo. Following it today
means opening a dozen GitHub tabs. The dashboard answers, on one screen:

1. **What changed** since I last looked? (merged PRs, ref moves, canary results, new failures)
2. **What state is everything in?** (main green or red, lkgr, what each channel names, deploys)
3. **What is waiting on me?** (PRs that need suraj's review or approval, held canaries, open failures)
4. **Is the machinery itself healthy?** (scheduled jobs running, state branches fresh, scorecard)

## What it is and is not

- **Read-only in v0.** It shows state and links to where to act. It never merges, approves,
  dispatches a workflow, moves a ref or writes to any repo. Actions come later, if ever, as a
  separate decision.
- **A window, not a new source of truth.** Every value on screen is read from the repo that owns
  it and links back to it. The dashboard stores nothing it could not throw away and rebuild.
- **Missing is never green.** A source that could not be read, or is older than it should be,
  shows as `unknown` (with why), never as healthy. This is the same rule qq uses everywhere.

### "Binds": how this plan reads it

The ask was a dashboard "designed in a way such that it binds". This plan reads that as: **the
dashboard binds directly to each repo's own state, through one small typed source layer**. Every
tile is bound to exactly one declared source (a file on a state branch, or one GitHub API call),
shows that source's freshness, and links to it. Adding a repo is one line of config, and adding a
new kind of state is one source module, never a change to the pages. If that is not what was
meant, change this section and the `Sources` contract in `AGENTS.md` follows it.

## Repos it covers

Checked on 2026-10-05 by anonymous `git ls-remote` against `github.com/quirq-ai/<name>`. The org's
repo list page and API are not readable from the build environment used for this plan, so the
dashboard itself lists the org's repos at run time and flags any repo it has no row for (see
*Repo registry* below).

| Group | Repo | What it is | What the dashboard shows for it |
|---|---|---|---|
| Product | `xo-space` | FastAPI app and Space UI that brokers coding agents; installed on users' machines | main tree status, lkgr, canary channel, open PRs, CI on main, perf (server start) |
| Product | `innernet` | Next.js folder search ("personal internet") | main tree status, lkgr, canary channel, open PRs, CI on main, perf (build size, search) |
| Product | `website` | Gatsby site, deployed by Vercel on every push to main | open PRs, CI on main, latest production deployment |
| qq infra | `infra-config` | Policy as code: the repo registry, channels, health signals, required checks | open PRs, CI on main, last policy change |
| qq infra | `gate` | Required checks, rulesets and repo settings as code | open PRs, CI on main |
| qq infra | `test-pipelines` | Results store, failure records, scorecard | open PRs, CI on main, scorecard |
| qq infra | `gardener` | Post-submit watcher: tree status, culprit finding, reverts | open PRs, CI on main, tree status for every product |
| qq infra | `release` | lkgr, channel pointers, daily canary and its report | open PRs, CI on main, channel board, canary history |
| qq infra | `perf` | Benchmarks and build size per landed commit | open PRs, CI on main, latest numbers |
| qq infra | `rollers` | Dependabot config and the toolchain-pin roller | open PRs (roll PRs), CI on main |
| qq infra | `toolchains` | Pinned Python, Node and pnpm builds | open PRs, CI on main |
| qq infra | `depot` | The `qq` command line | open PRs, CI on main |
| qq infra | `sync` | The `infra/repo.toml` manifest and its parser | open PRs, CI on main |
| qq infra | `recipes` | Build/test adapters per kind of repo | open PRs, CI on main |
| qq infra | `remote-build` | Action executor and cache | open PRs, CI on main |
| qq infra | `installer` | Follows channels for test installs | open PRs, CI on main |
| Knowledge | `research` | Research topics, including the interactive infra map | open PRs, recent merges |
| Knowledge | `wiki` | Docs and alpha feedback | open PRs, recent merges |
| Other | `marketing` | Campaign copy, launch posts, brand assets | open PRs, recent merges |
| Other | `monitoring` | This repo | open PRs, CI on main, its own deployment |
| Other | `xo-cowork-api`, `environment`, `quirq_ai` | Older repos whose future is not decided | shown under "Other" until suraj decides; can be hidden by config |

### Repo registry

The org already has a registry: infra-config `config/repos.toml`. Today it lists the three
products only (`xo-space`, `innernet`, `website`) with their kinds, channels and deploy target;
the 13 infra repos are listed in gate's `settings/github.toml`. The dashboard does not keep a third
copy of these facts:

- products and their channels and deploy targets come from infra-config `config/repos.toml`;
- infra repos come from gate `settings/github.toml` (its `[[repo]]` list: the 13 infra repos plus
  `xo-space` and `innernet`);
- everything else (knowledge, other) comes from this repo's `config/repos.json`, which only names
  a repo and its group, and is where a repo can be hidden.

At run time the dashboard also lists the org's public repos through the GitHub API and shows a
"not in any registry" notice for a repo none of the three names, so a new repo is never silently
missing.

## Where the state comes from

Every source below was read on 2026-10-05 from the public repos. All are public; no source needs
more than a read-only token, and the state-branch files need no token at all
(`raw.githubusercontent.com`, using the `refs/heads/<branch>` form so a tag can never stand in
for the branch).

| Source | Where | Schema | What it gives |
|---|---|---|---|
| Repo registry | infra-config `main`: `config/repos.toml` | TOML | products, their kinds, channels, deploy target |
| Channel rules | infra-config `main`: `config/channels.toml` | TOML | channel order (canary, dev, stable), cadence, canary cron (`17 6 * * *` UTC) |
| Health signals | infra-config `main`: `config/health.toml` | TOML | probes and v0 signals (canary-deploy, main-red-minutes, canary-probe) |
| Infra repo list | gate `main`: `settings/github.toml` | TOML | the infra repos under the `qq-main` ruleset, merge method, required approvals |
| Channels | release `release-state`: `channels.json` | `qq-channels/1` | per product and channel: commit, artifact digest, generation, operation, time |
| Pointers | release `release-state`: `pointers/<repo>/lkgr.json`, `pointers/<repo>/channels/<name>.json` | `qq-pointer/1` | lkgr and each channel with history, rollbacks, `pending`, `mirrored` |
| Canary runs | release `release-state`: `canary/<repo>/runs/<date>.json` | `qq-canary-run/1` | each day's verdict per stage: shipped, held, no-op, error |
| Canary holds | release `release-state`: `canary/<repo>/held/<commit>.json` | hold record | why a commit is held and whether it was released |
| Canary report | release `release-state`: `reports/<date>.md`, and the `Canary report <date>` issue labelled `canary-report` in release | Markdown | the day's plain-language summary |
| Tree status | gardener `tree-status`: `status/<repo>.json` | `qq-tree-status/1` | open/closed/unknown per product main, red ranges, coverage gaps |
| Revert ledger | gardener `ledger`: `reverts/<id>.json`, `failures/` | ledger records | reverts made against the cap. **The branch does not exist yet** (it starts once the gardener App exists), so this tile reads `unknown: ledger not started` |
| Scorecard | test-pipelines `results`: `scorecard.json`, `scorecard.md` | scorecard JSON | plan §8 metrics per repo, with "not measured" and "collect incomplete" kept visible |
| Failure records | test-pipelines `results`: `failures/`, mirrored to issues labelled `qq-failure` | `quirq-results/1` | held canaries, rollbacks and reverts, with culprit and fix |
| Perf | perf `perf-data`: `<repo>/<metric>.jsonl` (today `innernet/build-size`, `innernet/innernet-search`, `xo-space/xo-space-server-start`) | JSON lines | number per landed commit, with unit and runner |
| Pull requests | GitHub REST/GraphQL | GitHub | open, draft, merged; review requests and approvals; merge queue entries |
| Checks | GitHub REST: check runs on each repo's `main` head and each open PR head | GitHub | CI state per commit |
| Deployments | GitHub REST: deployments and deployment statuses | GitHub | Vercel production and preview deploys (to be confirmed per repo in M1) |
| Workflow runs | GitHub REST: scheduled runs of `release/canary`, `release/lkgr`, `gardener/tree-status`, `test-pipelines/scorecard`, `perf/perf` | GitHub | whether the machinery ran on time |

Freshness expectations the dashboard enforces (a source older than this shows `stale`):
tree status 15 min (runs every 5), lkgr pointer 1 h when main moved (runs every 10 min), canary
run record 26 h (daily at 06:17 UTC, with a watchdog at 09:43 and 13:43), scorecard 7 h (every 6 h),
perf 2 h (polls at :17 and :47). GitHub delays and sometimes drops scheduled runs on quiet repos,
so `stale` is a warning to look, not proof that something broke. These come from the schedules in
each repo's workflows; if a schedule changes, the number here changes in the same PR as the source
module.

## Features

### v0 (read-only, what gets built first)

1. **Today** (home). A feed of everything that changed since a point in time (default: the last
   24 hours; "since my last visit" is stored in the browser only): merged PRs per repo, lkgr and
   channel moves, canary verdicts, tree opened or closed, new failure records, deploys. Each item
   is one line with repo, what, when, and a link. At the top, three counts: **waiting on you**,
   **red or held**, **unknown or stale**.
2. **Waiting on you.** PRs where suraj is a requested reviewer or assignee, PRs whose approval was
   given on an older head (approval no longer counts), held canaries, open `qq-failure` issues.
3. **Board.** One row per repo, grouped (Products, qq infra, Knowledge, Other): main CI state, open
   PR count, last merge, and for products tree status, lkgr age and canary commit.
4. **Release.** Per product: main head, lkgr, `channels/canary`, dev and stable (declared, empty
   in v0), each with commit, digest, age and a link; the last 14 canary days as a strip of
   shipped/held/no-op/error; the latest canary report.
5. **Health.** Tree status per product with red ranges; the scorecard with its "not measured" rows
   kept; machinery freshness (each scheduled job's last successful run vs its schedule).
6. **Repo page.** Everything above for one repo, plus recent commits on main and perf history.
7. **Snapshot for agents.** `GET /api/snapshot` returns the same state as JSON (schema
   `qq-monitoring-snapshot/1`), so an agent answers "what state is X in" without scraping pages.

### v1

Search across PRs and issues; history charts (red minutes per week, canary streak, perf trends);
gate drift (rulesets as code vs live); alerts (a web push or an issue when main goes red or a
canary is held); PostHog signals once `health.toml` turns them on.

### v2 (needs its own decision)

Actions from the dashboard (approve, land, release a hold), which would make it a writer and needs
its own identity, review and audit. Out of scope until suraj asks.

## User journeys

**Morning check, on the phone (suraj).** Opens the dashboard. Today shows "2 waiting on you, 0 red,
1 stale". Taps *waiting on you*: one PR needs his approval, one canary was held overnight. Taps the
held canary: the stage that failed, the failure issue, the report. Taps through to GitHub to act.
Under a minute, no tabs.

**"Did my merge ship?"** Repo page for `website`: the merged PR, the main CI run, and the Vercel
production deployment for that commit, all green, with links.

**"Why is the canary not moving?"** Release page: lkgr has not moved for a day because the tree is
closed; the tree status shows the red range and the failing builder.

**"Is the machinery alive?"** Health page: tree-status last ran 4 minutes ago, scorecard 3 hours ago,
canary today at 06:19 UTC. A job that missed its window shows `stale` with the last run's link.

**An agent starting work.** `GET /api/snapshot`: is main green, what is lkgr, are there held
canaries. It reads, decides, then works in the repo itself; it never acts through the dashboard.

## Architecture

```
  GitHub (public repos)                       monitoring (Next.js 16 on Vercel)
  ---------------------                       ---------------------------------
  state branches  --raw.githubusercontent-->  lib/sources/*   one module per source:
    release-state, tree-status,                 fetch -> validate (schema) -> Signal
    results, perf-data, ledger                  every Signal has value | unknown,
  config on main  --raw.githubusercontent-->    sourceUrl, fetchedAt, observedAt
    repos.toml, channels.toml, ...                         |
  REST/GraphQL API --token from env------->   lib/model/*  joins Signals into
    PRs, checks, deployments, runs, issues      Repo, Change, Channel, Freshness
                                                           |
                                              app/*  server components render
                                                shadcn UI; /api/snapshot = same model as JSON
```

- **Next.js 16, App Router, React Server Components.** Pages render on the server from the model;
  the browser gets HTML plus small client islands (theme toggle, filters, "since last visit").
- **Caching.** Each source declares how long its data may be cached (state branches 60 s, API
  lists 120 s). Next's data cache revalidates on that interval. No database in v0.
- **One read-only token.** `GITHUB_TOKEN` (a fine-grained token with public read only, or a GitHub
  App installation token) lives only in Vercel's environment variables. It raises the API limit
  from 60 to 5,000 requests an hour. Without it the dashboard still works for state branches and
  marks API-backed tiles `unknown: no token`.
- **Hosting.** Vercel, like `website`: a push to main deploys production, PRs get previews. Access
  is public read, since every repo it reads is public; putting it behind a login is a v1 option.
- **No writes anywhere.** The token has no write scopes, and the code has no code path that writes.

## Design

- **shadcn/ui components** (project rule: shadcn unless suraj names another library), Tailwind 4,
  `lucide-react` icons. Card, Badge, Table, Tabs, Separator, Tooltip, Skeleton, Alert, Sheet.
- **quirq brand.** Wordmark and mark from innernet `public/brand/quirq/` (`wordmark.svg`,
  `mark.svg`, `app-icon.svg`). Colors from xo-space `space_ui/css/themes.css`: dark is the `quirq`
  theme (lines 7-25, `--bg #100f14`, `--ink #f3ece4`, `--accent #f2a2d5`), light is the `linen`
  theme (lines 62-74, `--bg #f7f5f0`, `--ink #302b26`, `--accent #a64d2f`). Fonts: Poppins
  (headings), Inter (text), JetBrains Mono (SHAs, numbers).
- **Phone first.** Designed at 390 px wide, then desktop. One column on a phone, a board on a
  desktop. Light and dark, following the system setting, with a toggle.
- **Contrast.** Text at least 4.5:1, lines and state markers at least 3:1, in both themes. State is
  never shown by color alone: every state has a word (`green`, `red`, `held`, `pending`,
  `unknown`, `stale`) and an icon.
- **Simple.** One screen per question above. Numbers before charts; a chart only where a trend is
  the answer (canary strip, perf history). No popup ever scrolls; detail goes on a page.

## Security

- Repos are public, but the dashboard still treats everything it reads as untrusted: PR titles,
  issue bodies and report Markdown are rendered as text or through a sanitizing Markdown renderer,
  never as raw HTML.
- Secrets only in environment variables, never in files, commits, logs or the snapshot JSON.
- The snapshot and pages show only what is already public on GitHub.

## Build plan

The milestones, each a small PR with its own done-when, are in [`AGENTS.md`](AGENTS.md#milestones).
In short: M0 scaffold, M1 sources, M2 model and snapshot, M3 Today and Waiting on you, M4 Board
and Repo page, M5 Release and Health, M6 polish and audit.

## Open questions (for suraj)

- Public dashboard, or behind a login? (Default: public, since every source is public.)
- Should `xo-cowork-api`, `environment` and `quirq_ai` show, or be hidden? (Default: shown under
  Other.)
- A custom domain (for example `status.quirq.ai`)? (Default: the Vercel URL.)
- Which events, if any, should alert you in v1? (Default: none in v0.)

## License

Apache-2.0, like the other quirq-ai repos.
