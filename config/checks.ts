// Check runs on a repo's head commit that are not that repo's own CI. test-pipelines'
// compatibility check (compat.yml) runs every org repo's code from test-pipelines and names each
// per-repo job `compat (<repo>)`; a red one is that repo's verdict, not test-pipelines', so the
// "CI on main" rollup leaves those runs out. compat's other jobs, and compat-publish, still count.
export const NOT_OWN_CHECKS: Readonly<Record<string, RegExp>> = {
  "test-pipelines": /^compat \(.+\)$/,
};

export function isOwnCheck(repo: string, name: string): boolean {
  return !NOT_OWN_CHECKS[repo]?.test(name);
}
