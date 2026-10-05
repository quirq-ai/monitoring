# monitoring

The quirq-ai monitoring dashboard: one place to see **what changed across the org and what state
everything is in**, on a phone or a desktop.

This repo holds the plan only. Nothing is built yet. This README is the plan for people: what the
dashboard is, what it covers, how it looks and in what order it gets built. [`AGENTS.md`](AGENTS.md)
is the plan for the agents that build it: the stack, rules, every data source, milestones and how
to check their work. A PR that changes the plan updates both files.

## Why it exists

quirq-ai has 30 public repos, most of them changed by agents several times a day. Changes land
through merge queues, a daily canary ships builds, a gardener watches main and perf records numbers.
Each of these keeps its state on its own branch in its own repo, so following it today means opening
a dozen GitHub tabs. The dashboard answers four questions on one screen:

1. **What changed** since I last looked? (merged PRs, ref moves, canary results, new failures)
2. **What state is everything in?** (main green or red, lkgr, what each channel names, deploys)
3. **What is waiting on me?** (PRs that need suraj, held canaries, open failures)
4. **Is the machinery healthy?** (scheduled jobs running on time, scorecard)

## What it is and is not

- **Read-only in v0.** It shows state and links to where you act. It never merges, approves,
  comments, dispatches a workflow, moves a ref or files an issue.
- **A window, not a new source of truth.** Every value is read from the repo that owns it and links
  back to it. The dashboard stores nothing it could not throw away and rebuild.
- **Missing is never green.** A source that could not be read, or whose writer has not run on time,
  shows as `unknown` or `stale` with the reason. It never shows as healthy.

## Open questions for suraj

Each has a default the build uses until you answer.

1. **What "binds" means.** The ask was a dashboard "designed in a way such that it binds". The
   default reading: the dashboard binds directly to each repo's own state through one small, typed
   source layer. Every tile names its one source, shows how fresh it is and links to it. Adding a
   repo is one line of config, and a new kind of state is one source module, never a page change.
2. **Public, or behind a login?** Default: public, since every source is public.
3. **Older repos** (`xo-cowork-api`, `environment`, `quirq_ai`, empty `quirqy`): show or hide?
   Default: shown under Other.
4. **License for this repo.** Default: Apache-2.0, like the qq infra repos (xo-space and research
   are MIT). It is already on `main`.
5. **Hosting.** Default: Vercel under the same team as `website`, at the Vercel URL. A custom domain
   (for example `status.quirq.ai`) is your call.

## Repos it covers

All 30 public repos, from the wiki's daily manifest (generated from the GitHub org list on
2026-10-05) plus `wiki` and `monitoring`. Every repo gets open PRs, recent merges and CI on main.
The rows below add what is specific to each group.

| Group | Repos | Also shows |
|---|---|---|
| Products | `xo-space`, `innernet` | tree status, lkgr, canary channel, perf |
| Products | `website` | latest Vercel production deploy |
| qq infra | `infra-config`, `gate`, `test-pipelines`, `gardener`, `release`, `perf`, `rollers`, `toolchains`, `depot`, `sync`, `recipes`, `remote-build`, `installer` | whether their 9 scheduled jobs (in 7 of these repos) ran on time; release, gardener, test-pipelines and perf also feed the Release and Health pages |
| Apps in progress | `euler`, `galileo`, `instants`, `quitter` | latest deploy where one exists |
| Knowledge | `research`, `wiki`, `docs`, `marketing`, `.github` | nothing extra |
| Other | `monitoring`, `xo-cowork-api`, `environment`, `quirq_ai`, `quirqy` | nothing extra (`quirqy` has no commits) |

What each repo is:

- **Products.** `xo-space`: the FastAPI app and Space UI that brokers coding agents, installed on
  users' machines. `innernet`: Next.js folder search. `website`: the Gatsby site, deployed by
  Vercel on every push to main.
- **qq infra** (quirq's CI/CD system). `infra-config`: policy as code. `gate`: required checks and
  rulesets. `test-pipelines`: results store and scorecard. `gardener`: keeps main green. `release`:
  lkgr, channels and the daily canary. `perf`: benchmarks and build size. `rollers`: moves pins
  forward. `toolchains`: pinned Python, Node and pnpm. `depot`: the `qq` command. `sync`: the repo
  manifest. `recipes`: build and test adapters. `remote-build`: executor and cache. `installer`:
  follows channels.
- **Apps in progress.** `euler`: a local workspace that runs Innernet, Quitter and Instants
  together. `galileo`: the inspector of a space. `instants`: a team collaboration prototype.
  `quitter`: an agent and thread activity prototype.
- **Knowledge.** `research`: research topics, including the interactive infra map. `wiki`: a
  bot-generated map of every public repo, regenerated daily. `docs`: Space product docs.
  `marketing`: campaign copy and brand assets. `.github`: the org profile.

The repo list is not hard-coded. Products and infra repos come from the registries that already
exist (infra-config `config/repos.toml`, gate `settings/github.toml`). The rest come from a small
`config/repos.json` here. Any public repo that none of them names shows a "not in any registry"
notice, so a new repo is never silently missing.

## What it reads

Only public data, from the repos that own it:

- **State branches**: `release-state` in release (lkgr, channels, canary runs and reports),
  `tree-status` in gardener, `results` in test-pipelines (scorecard, failure records), `perf-data`
  in perf.
- **Config on main**: infra-config (registry, channels, health signals) and gate (repo settings).
- **The GitHub API**: PRs and reviews, checks, deployments, scheduled workflow runs and labelled
  issues.

Every path, schema and refresh rule is in [AGENTS.md, Sources](AGENTS.md#sources). One source is
not live yet: gardener's revert `ledger` branch starts once the gardener App exists, so its tile
reads `unknown: ledger not started` until then.

## Features

### v0 (read-only, built first)

1. **Today** (home). Everything that changed since a point in time: merged PRs, lkgr and channel
   moves, canary verdicts, tree opened or closed, new failure records, deploys. One line per item
   with repo, what, when and a link. The default window is the last 24 hours, and "since my last
   visit" is kept in the browser only. At the top are three counts: **waiting on you**, **red or
   held**, **unknown or stale**.
2. **Waiting on you.** PRs where suraj is a requested reviewer or assignee, PRs whose approval was
   on an older head, held canaries and open `qq-failure` issues.
3. **Board.** One row per repo, grouped as in the table above: main CI, open PRs, last merge, and
   for products, tree status, lkgr age and canary commit.
4. **Release.** Per product: main head, lkgr and each channel (canary live; dev and stable declared
   but empty in v0) with commit, digest, age and link. Also the last 14 canary days as a strip of
   shipped, held, no-op and error, and the latest canary report.
5. **Health.** Tree status per product with red ranges, the scorecard with its "not measured" rows
   kept, and whether each scheduled job last succeeded within its window.
6. **Repo page.** All of the above for one repo, plus recent commits on main and perf history.
7. **Snapshot for agents.** `GET /api/snapshot` returns the same state as JSON, so an agent can ask
   "what state is X in" without scraping pages.

### v1

Search across PRs and issues. History charts (red minutes per week, canary streak, perf trends).
Gate drift (rulesets as code against live). Web push alerts when main goes red or a canary is
held. PostHog signals once `health.toml` turns them on. A GitHub App instead of a personal token.
monitoring onboarded to gate, so its own main is protected like the infra repos.

### v2 (needs its own decision)

Anything that writes: alert issues on GitHub, or acting from the dashboard (approve, land, release
a hold). Writing needs its own identity, review and audit, so it waits until suraj asks.

## User journeys

**Morning check, on the phone.** suraj opens the dashboard. Today shows "2 waiting on you, 0 red,
1 stale". He taps *waiting on you*: one PR needs his approval and one canary was held overnight. He
taps the held canary and sees the stage that failed, the failure issue and the report, then taps
through to GitHub to act. It takes under a minute with no tabs.

**"Did my merge ship?"** On the `website` repo page: the merged PR, the main CI run and the Vercel
production deploy for that commit, each with its state and a link.

**"Why is the canary not moving?"** On the Release page, lkgr has not moved for a day because the
tree is closed. The tree status shows the red range and the failing builder.

**"Is the machinery alive?"** On the Health page, tree-status last succeeded 4 minutes ago and
canary at 06:19 UTC. A job that missed its window shows `stale` with its last run's link.

**An agent starting work** reads `GET /api/snapshot`: is main green, what is lkgr, is anything held.
It decides from that, then works in the repo itself. It never acts through the dashboard.

## Architecture

1. **Sources.** One module per source in `lib/sources/` reads a state-branch file or one GitHub API
   query, validates it against a schema and returns a typed `Signal`: the value, or `unknown` with a
   reason, plus where it came from and when.
2. **Model.** `lib/model/` joins Signals into repos, changes, channels and freshness.
3. **Pages.** Next.js 16 server components render the model with shadcn components.
   `/api/snapshot` serves the same model as JSON.

- **Hosting.** Vercel, like `website`: a push to main deploys production and PRs get previews.
- **Caching.** Each source declares how long it may be cached (two minutes for PRs and checks, up
  to an hour for the repo list). No database.
- **One read-only token.** `GITHUB_TOKEN`, a fine-grained token with public read access only, kept
  in Vercel's environment variables. Without it the state-branch tiles still work and API-backed
  tiles read `unknown: no token`.
- **Budget.** Under 500 GitHub REST requests and 2,500 GraphQL points an hour, whatever the
  number of visitors, against limits of 5,000 each. Shared caches, one GraphQL query for all
  repos' PRs and checks, and page addresses checked against the registry before anything is
  fetched keep it there.

## Design

- **shadcn/ui components**, Tailwind 4 and `lucide-react` icons.
- **quirq brand.** Wordmark and mark from innernet `public/brand/quirq/`. Colors from xo-space
  `space_ui/css/themes.css`: dark is the `quirq` theme, light is `linen`. Poppins for headings, Inter
  for text, JetBrains Mono for SHAs and numbers.
- **Phone first.** Designed at 390 px wide, then desktop: one column on a phone, a board on a
  desktop. Light and dark follow the system setting, with a toggle.
- **Contrast.** Text at least 4.5:1, borders and state markers at least 3:1, in both themes. A state
  is never shown by color alone: each has a word (`green`, `red`, `held`, `pending`, `unknown`,
  `stale`) and an icon.
- **Simple.** One screen per question. Numbers before charts, and a chart only where a trend is the
  answer. No popup ever scrolls; detail goes on a page.
- **Safe with others' text.** PR titles, issue bodies and reports are shown as text, never as HTML.

## Setup steps for suraj (after M0 lands)

Nothing to do now. When the scaffold (M0) is merged:

1. **Create the token.** Go to https://github.com/settings/personal-access-tokens/new. Name it
   `monitoring-read`, set the expiration to 90 days, choose **Public repositories** under
   Repository access and add no permissions. Click **Generate token** and copy it.
2. **Create the Vercel project.** Go to https://vercel.com/new, pick the team that hosts `website`,
   import `quirq-ai/monitoring` and keep the Next.js defaults.
3. **Add the token.** In the project, go to Settings > Environment Variables, add `GITHUB_TOKEN` with
   the token for Production and Preview, then redeploy.
4. **Rotate it.** Before the 90 days are up, repeat steps 1 and 3. When the token expires, the
   dashboard shows `unknown: token rejected` on API tiles; it does not break.

## Build plan

Milestones, each a small PR with its own check, are in [AGENTS.md](AGENTS.md#milestones): M0
scaffold, M1 sources, M2 model and snapshot, M3 Today and Waiting on you, M4 Board and Repo page, M5
Release and Health, M6 polish and audit.

## License

Apache-2.0 (see open question 4).
