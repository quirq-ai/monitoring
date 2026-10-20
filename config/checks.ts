// Check runs on a repo's head commit that are not that repo's own CI. test-pipelines'
// compatibility check (compat.yml) runs every org repo's code from test-pipelines and names each
// per-repo job `compat (<repo>)`; a red one is that repo's verdict, not test-pipelines', so the
// "CI on main" rollup leaves those runs out. compat's other jobs, and compat-publish, still count.
// Only GitHub Actions jobs are left out: a run of that name from any other app still counts. If
// compat.yml renames its per-repo job, change this pattern first; until then those runs count as
// test-pipelines' own (red, never hidden).
export const NOT_OWN_CHECKS: Readonly<Record<string, RegExp>> = {
  "test-pipelines": /^compat \(.+\)$/,
};

export function isOwnCheck(repo: string, name: string, app: string): boolean {
  return !(app === "github-actions" && NOT_OWN_CHECKS[repo]?.test(name));
}
