# Fixtures

Files the tests and the Playwright run read instead of GitHub. `raw/<repo>/<branch>/<path>` mirrors
the raw URL layout; `api/*.json` are GitHub API responses; `routes.json` says which API path serves which
file (first match wins; `*` matches one path segment, a query value ending in `*` matches by prefix).
The fixture server (`server.mjs`) replaces `{{now}}`, `{{now-5m}}`, `{{today}}` and `{{yesterday}}`
tokens with times relative to the request, so freshness and "N min ago" stay meaningful.

Nothing here is a secret: every file is public on GitHub or invented.

**Captured** means copied unchanged from the public branch named. **Synthetic** means written by hand
in the real shape; synthetic files never stand in for a check that the real data passes.

| Fixture | Origin |
|---|---|
| `raw/release/release-state/channels.json` | captured from release `release-state` at 1ffbf26403e00165fe9642590c4df06d23d8e30a |
| `raw/release/release-state/pointers/innernet/lkgr.json` | captured from release `release-state` at 1ffbf26403e00165fe9642590c4df06d23d8e30a |
| `raw/release/release-state/pointers/xo-space/lkgr.json` | captured from release `release-state` at 1ffbf26403e00165fe9642590c4df06d23d8e30a |
| `raw/release/release-state/pointers/innernet/channels/canary.json` | captured from release `release-state` at 1ffbf26403e00165fe9642590c4df06d23d8e30a |
| `raw/release/release-state/pointers/xo-space/channels/canary.json` | captured from release `release-state` at 1ffbf26403e00165fe9642590c4df06d23d8e30a |
| `raw/release/release-state/canary/innernet/runs/2026-10-05.json` | captured from release `release-state` at 1ffbf26403e00165fe9642590c4df06d23d8e30a |
| `raw/release/release-state/canary/innernet/runs/2026-10-06.json` | captured from release `release-state` at 1ffbf26403e00165fe9642590c4df06d23d8e30a |
| `raw/release/release-state/canary/xo-space/runs/2026-10-05.json` | captured from release `release-state` at 1ffbf26403e00165fe9642590c4df06d23d8e30a |
| `raw/release/release-state/canary/xo-space/runs/2026-10-06.json` | captured from release `release-state` at 1ffbf26403e00165fe9642590c4df06d23d8e30a |
| `raw/release/release-state/reports/2026-10-05.md` | captured from release `release-state` at 1ffbf26403e00165fe9642590c4df06d23d8e30a |
| `raw/release/release-state/reports/2026-10-06.md` | captured from release `release-state` at 1ffbf26403e00165fe9642590c4df06d23d8e30a |
| `raw/gardener/tree-status/status/innernet.json` | captured from gardener `tree-status` at ea5544df11ac35cdb9573edc8bbdce0d8dc03255 |
| `raw/gardener/tree-status/status/xo-space.json` | captured from gardener `tree-status` at ea5544df11ac35cdb9573edc8bbdce0d8dc03255 |
| `raw/test-pipelines/results/scorecard.json` | captured from test-pipelines `results` at 5959080f0d02e8efaf8f6728bef4d366dee41425 |
| `raw/test-pipelines/results/failures/qq-failure-canary-held-aefebec4c11f668b/failure.json` | captured from test-pipelines `results` at 5959080f0d02e8efaf8f6728bef4d366dee41425 |
| `raw/perf/perf-data/innernet/build-size.jsonl` | captured from perf `perf-data` at b94c958011be3b3b1835a41debe53f5cbc5f6413 |
| `raw/perf/perf-data/innernet/innernet-search.jsonl` | captured from perf `perf-data` at b94c958011be3b3b1835a41debe53f5cbc5f6413 |
| `raw/perf/perf-data/xo-space/xo-space-server-start.jsonl` | captured from perf `perf-data` at b94c958011be3b3b1835a41debe53f5cbc5f6413 |
| `raw/infra-config/main/config/repos.toml` | captured from infra-config `main` on 2026-10-06 (raw.githubusercontent.com) |
| `raw/infra-config/main/config/channels.toml` | captured from infra-config `main` on 2026-10-06 (raw.githubusercontent.com) |
| `raw/infra-config/main/config/health.toml` | captured from infra-config `main` on 2026-10-06 (raw.githubusercontent.com) |
| `raw/infra-config/main/config/rollers.toml` | captured from infra-config `main` on 2026-10-06 (raw.githubusercontent.com) |
| `raw/gate/main/settings/github.toml` | captured from gate `main` on 2026-10-06 (raw.githubusercontent.com) |
| `raw/wiki/main/.quirq-wiki-manifest.json` | captured from wiki `main` on 2026-10-06 (raw.githubusercontent.com) |
| `raw/release/release-state/canary/xo-space/runs/{{today}}.json` | synthetic: the captured xo-space 2026-10-05 run with `verify` failed and the date set to the request day |
| `raw/release/release-state/canary/innernet/runs/{{today}}.json` | synthetic: the captured innernet 2026-10-05 run with the date set to the request day |
| `raw/release/release-state/canary/xo-space/held/14b21a41668bc8124b4cf5cf9cd59fb44dc7d419.json` | synthetic: built from release `src/qqrelease/canary.py` `_hold_record` at 581fdf2 (no real hold exists yet) |
| `api/monitoring_check-runs.json` | captured 2026-10-06 from GET repos/quirq-ai/monitoring/commits/main/check-runs |
| `api/monitoring_deployments.json` | captured 2026-10-06 from GET repos/quirq-ai/monitoring/deployments |
| `api/monitoring_deployment_statuses.json` | captured 2026-10-06 from GET repos/quirq-ai/monitoring/deployments/6895210268/statuses |
| `api/monitoring_ci_runs.json` | captured 2026-10-06 from GET repos/quirq-ai/monitoring/actions/workflows/ci.yml/runs?status=completed |
| `api/monitoring_pull_2.json` | captured 2026-10-06 from GET repos/quirq-ai/monitoring/pulls/2 |
| `api/monitoring_pull_2_reviews.json` | captured 2026-10-06 from GET repos/quirq-ai/monitoring/pulls/2/reviews |
| `api/monitoring_contents_tests.json` | captured 2026-10-06 from GET repos/quirq-ai/monitoring/contents/tests (shape sample for directory listings) |
| `api/test-pipelines_contents_failures.json` | synthetic listing in the contents API shape; names are the real entries of test-pipelines `results` failures/ at 5959080f0d02e8efaf8f6728bef4d366dee41425 |
| `api/perf_contents_innernet.json` | synthetic listing; names are the real files of perf `perf-data` at b94c958011be3b3b1835a41debe53f5cbc5f6413 |
| `api/perf_contents_xo-space.json` | synthetic listing; names are the real files of perf `perf-data` at b94c958011be3b3b1835a41debe53f5cbc5f6413 |
| `api/gardener_contents_reverts.json` | synthetic: a ledger listing for the "started" case (the branch does not exist yet); the name follows ledger.py revert_id = <repo>-<culprit12> |
| `raw/gardener/ledger/reverts/innernet-8f383a3d6c28.json` | synthetic: built from gardener src/qqgarden/ledger.py Entry at bf7d24d (schema qq-revert/1); no real record exists yet and the dashboard only counts records today |
| `api/release_contents_canary_innernet_runs.json` | synthetic listing in the contents API shape: the captured run files of innernet plus the synthetic one for the request day |
| `api/release_contents_canary_xo-space_runs.json` | synthetic listing in the contents API shape: the captured run files of xo-space plus the synthetic one for the request day |
| `api/gardener_contents_landed.json` | synthetic: an empty ledger landed/ listing |
| `api/org_repos.json` | synthetic list in the orgs/<org>/repos shape; names are the real public repos from the wiki manifest generated 2026-10-06T12:18Z |
| `api/gardener_tree-status_commits.json` | built from the git log of gardener `tree-status` at ea5544df11ac35cdb9573edc8bbdce0d8dc03255: real shas and messages, except the newest three whose times are set relative to the request and the second of which says innernet closed, so a close and a reopen appear |
| `api/runs_gardener_tree-status.json` | synthetic, in the captured ci.yml runs shape: the newest run is success at {{now-4m}}, then a cancelled one (routine), then an older success |
| `api/runs_release_lkgr.json` | synthetic, in the captured ci.yml runs shape: the newest run is success at {{now-7m}}, then a cancelled one (routine), then an older success |
| `api/runs_perf_perf.json` | synthetic, in the captured ci.yml runs shape: the newest run is success at {{now-3h}}, then a cancelled one (routine), then an older success |
| `api/runs_test-pipelines_scorecard.json` | synthetic, in the captured ci.yml runs shape: the newest run is failure at {{now-2h}}, then a cancelled one (routine), then an older success |
| `api/runs_release_canary.json` | synthetic, in the captured ci.yml runs shape: the newest run is success at {{now-7h}}, then a cancelled one (routine), then an older success |
| `api/runs_release_canary-watchdog.json` | synthetic, in the captured ci.yml runs shape: the newest run is success at {{now-5h}}, then a cancelled one (routine), then an older success |
| `api/runs_rollers_roll-toolchains.json` | synthetic, in the captured ci.yml runs shape: the newest run is success at {{now-2d}}, then a cancelled one (routine), then an older success |
| `api/runs_depot_e2e-sync.json` | synthetic, in the captured ci.yml runs shape: the newest run is success at {{now-15h}}, then a cancelled one (routine), then an older success |
| `api/runs_installer_live-manifest.json` | synthetic, in the captured ci.yml runs shape: the newest run is success at {{now-3h}}, then a cancelled one (routine), then an older success |
| `api/runs_stale.json` | synthetic: one success far outside every window, for the stale test |
| `api/runs_empty.json` | synthetic: no completed runs |
| `api/search_pulls_open.json` | synthetic search result in the search/issues shape: five open PRs across repos, one draft, one assigned to the owner |
| `api/search_pulls_merged.json` | synthetic: three merged PRs; the monitoring one is real (#2, merged 2026-10-06T17:16Z), the two others invented |
| `api/search_pulls_review-requested.json` | synthetic: the innernet PR with the owner as requested reviewer |
| `api/search_pulls_reviewed-by.json` | synthetic: the xo-space PR the owner approved on an older head |
| `api/search_empty.json` | synthetic: no results |
| `api/xo-space_pull_77.json` | synthetic, in the captured pulls/<n> shape: head 9b1d3f5 |
| `api/xo-space_pull_77_reviews.json` | synthetic, in the captured reviews shape: the owner approved commit 4c0ffee, older than the head |
| `api/search_issues_qq-failure.json` | synthetic: one open qq-failure issue in release |
| `api/search_issues_canary-report.json` | synthetic: the day's canary report issue |
| `api/checks_green.json` | synthetic, in the captured check-runs shape: two passing checks (default for every repo) |
| `api/checks_red.json` | synthetic: one failed check |
| `api/checks_pending.json` | synthetic: one check still running |
| `api/checks_none.json` | synthetic: no check runs |
| `api/deployments_innernet.json` | synthetic, in the captured deployments shape |
| `api/deployments_innernet_statuses.json` | synthetic, in the captured statuses shape |
| `api/deployments_website.json` | synthetic |
| `api/deployments_website_statuses.json` | synthetic: a failed deploy |
| `api/deployments_empty.json` | synthetic: a repo with no deployments |
