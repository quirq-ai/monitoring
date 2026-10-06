# monitoring

The quirq-ai monitoring dashboard: one page that says **what changed across the org and what state
everything is in**, on a phone or a desktop. suraj's Vercel project serves it at
[monitoring.quirq.dev](https://monitoring.quirq.dev/).

It is read-only. It reads the state the other repos already publish, shows it with the word
(`green`, `red`, `held`, `pending`, `unknown`, `stale`) before the color, and links every value to
the file or GitHub page it came from. It never merges, approves, comments or moves a ref.

## The pages

| Page | The question it answers |
|---|---|
| **Today** (`/`) | What changed in the last 24 hours (or 7 days): merged PRs, lkgr and channel moves, canary results, tree opened or closed, deploys, new failures. Three counts on top: waiting on you, red or held, unknown or stale. |
| **Waiting on you** (`/waiting`) | PRs where you are a requested reviewer or assignee, PRs you approved on an older head, held canaries, open `qq-failure` issues. |
| **Board** (`/board`) | One row per repo, grouped: CI on main, open PRs, last merge; for products also tree, lkgr, canary and deploy. |
| **Release** (`/release`) | Per product: lkgr and each channel, the last 14 canary days as a strip, the hold if one is on, and the latest canary report. |
| **Health** (`/health`) | Whether each of the 9 scheduled writers ran on time, the scorecard, the gardener ledger, and every source this render read with its state. |
| **Repo** (`/repos/<name>`) | Everything above for one repo, plus its open PRs, the checks on its head, its tree builders and its perf metrics. |
| **Snapshot** (`/api/snapshot`) | The same state as JSON (`qq-monitoring-snapshot/1`), for agents. `?since=7d` widens the window. |

Every tile shows the state first, then the detail, then where it came from and how old the data
says it is. A source that cannot be read shows `unknown` with the reason; a writer that has not run
inside its window shows `stale`. Nothing missing is ever shown as green.

## Run it

```sh
pnpm install --frozen-lockfile
pnpm dev                      # http://localhost:3000, state-branch tiles work with no token
```

Add a token to make the GitHub API tiles (PRs, checks, deploys, writer runs, issues) work:

```sh
cp .env.example .env.local    # then put a read-only token in GITHUB_TOKEN
```

The token is a fine-grained personal access token with **Public repositories** access and no
permissions: https://github.com/settings/personal-access-tokens/new. Without one those tiles read
`unknown: no token` and everything else still works.

Check a change before pushing (CI runs the same):

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
pnpm live                     # every source once against the real branches, one line each
```

`pnpm test` and `pnpm e2e` never touch the network: they read captured and synthetic files through
a small fixture server (`tests/fixtures/`), so a Playwright run at 390 and 1280 px, light and dark,
is the same every time. The screenshots land in `test-results/screenshots/`, and CI uploads them.

## Where the data comes from

Only public data, from the repos that own it. Nothing is restated here.

- **State branches**: `release-state` in release (channels, lkgr and channel pointers, canary runs,
  holds, daily reports), `tree-status` in gardener, `results` in test-pipelines (scorecard,
  failure records), `perf-data` in perf. Read from raw.githubusercontent.com, which can be up to 5
  minutes behind.
- **Config on main**: infra-config `config/repos.toml` (the products) and `config/channels.toml`
  (channel order and cadence), gate `settings/github.toml` (every repo behind the gate). This repo's
  `config/repos.json` adds only the repos neither names. Any public repo none of them knows shows
  under "Not in any registry".
- **The GitHub API**, with the token: PRs and reviews (one org-wide search, not a call per repo),
  check runs, deployments, the writers' workflow runs, `qq-failure` and `canary-report` issues, the
  org repo list.

The gardener `ledger` branch does not exist yet, so its tile reads `unknown: ledger not started`
until the gardener App lands. The one failure record on `results` today is a planted demo; it is
shown with a label and never counted.

Every path, schema, cache window and freshness rule is in [AGENTS.md](AGENTS.md), which is the
guide for the agents that build this. A PR that changes a source updates both files.

## Repos it covers

| Group | Repos | Also shows |
|---|---|---|
| Products | `xo-space`, `innernet`, `website` (from infra-config) | tree status, lkgr, canary, production deploy, perf |
| qq infra | every non-product repo in gate `settings/github.toml`: `infra-config`, `gate`, `test-pipelines`, `gardener`, `release`, `perf`, `rollers`, `toolchains`, `depot`, `sync`, `recipes`, `remote-build`, `installer` | whether their scheduled writers ran on time (Health) |
| Apps in progress | `euler`, `galileo`, `instants`, `quitter` | |
| Knowledge | `research`, `wiki`, `docs`, `marketing`, `.github` | |
| Other | `monitoring`, `xo-cowork-api`, `environment`, `quirq_ai`, `quirqy` | |

## Deploy

Vercel's GitHub app builds `main` into the production deployment and every PR into a preview (both
show up in the repo's deployments and on the PR). The project needs one environment
variable, `GITHUB_TOKEN`, set in Vercel under Settings > Environment Variables for Production and
Preview; `MONITORING_OWNER` (default `sharmasuraj0123`) says whose "waiting on you" it is. Rotate the
token before it expires: an expired one shows as `unknown: token rejected` on the API tiles and
breaks nothing else.

## What is not built

- Search, history charts, gate drift, push alerts, PostHog signals, a GitHub App in place of the
  token (v1, not started).
- Anything that writes: filing alert issues, approving, landing or releasing a hold from the
  dashboard (v2, waits for its own decision).
- The dev and stable channels show "nothing promoted yet" until release promotes to them.

## How it is built

Next.js 16 (App Router, server components), TypeScript strict, Tailwind 4 and shadcn/ui, zod for
every file read, Vitest and Playwright. The quirq brand: wordmark from innernet, colors from
xo-space's `quirq` (dark) and `linen` (light) themes, Poppins, Inter and JetBrains Mono. Phone
first; text contrast at least 4.5:1 and markers at least 3:1 in both themes, checked by a test.
No popup ever scrolls. Titles and reports written by others are shown as text, never as HTML.

## License

Apache-2.0.
