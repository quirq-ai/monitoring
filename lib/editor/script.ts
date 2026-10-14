import "server-only";
import { commitMessage, contentsPath, type Plan } from "@/lib/editor/plan";
import { ORG } from "@/lib/fetch";

// The plan as a bash script the person runs with their own gh login, for when the editor runs on
// a server that does not write (the deployed site). It is safe on macOS's bash 3.2 and BSD tools,
// needs only gh, reads the live state first and stops before writing anything if a file or a
// property changed since the editor read it, and asks for an exact lowercase "yes".

/** A bash single-quoted word: nothing inside is expanded. */
export function sq(text: string): string {
  return `'${text.replace(/\0/g, "").replace(/'/g, `'\\''`)}'`;
}

export const SCRIPT_NAME = "settings-change.sh";

export function renderScript(plan: Plan): string {
  const L: string[] = [];
  const prCount = plan.prs.length;
  const propCount = plan.properties.length;
  L.push(
    "(",
    `[ -n "\${BASH_VERSION:-}" ] || { echo "Run this with: bash ${SCRIPT_NAME}"; exit 1; }`,
    "set -euo pipefail",
    `echo "quirq settings editor: ${prCount} pull request${prCount === 1 ? "" : "s"}, ${propCount} property change${propCount === 1 ? "" : "s"} (plan ${plan.digest.slice(0, 12)})."`,
    "# Only your own gh login acts: tokens in the environment are ignored.",
    "unset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN GITHUB_ENTERPRISE_TOKEN GH_HOST",
    `O=${sq(ORG)}`,
    'command -v gh >/dev/null 2>&1 || { echo "STOP: gh is not installed (https://cli.github.com). Nothing was written."; exit 1; }',
    'ME=$(gh api user --jq .login) || { echo "STOP: gh is not signed in. Run: gh auth login, then this again. Nothing was written."; exit 1; }',
    'echo "Signed in to gh as $ME."',
    "",
    'echo "Checking that nothing changed since the editor read it (read-only)..."',
    "# file_sha REPO PATH: the blob id on main, or none.",
    'file_sha() { gh api "repos/$O/$1/contents/$2?ref=main" --jq .sha 2>/dev/null || echo none; }',
    'prop_value() { gh api "repos/$O/$1/properties/values" --jq "[.[] | select(.property_name == \\"$2\\") | .value][0] // \\"\\""; }',
  );
  for (const pr of plan.prs) {
    for (const f of pr.files) {
      const want = f.baseSha ?? "none";
      L.push(
        `got=$(file_sha ${sq(f.file.repo)} ${sq(f.file.path)})`,
        `[ "$got" = ${sq(want)} ] || { echo "STOP: ${f.file.repo} ${f.file.path} changed since you edited it (main has $got, you edited ${want}). Nothing was written. Reload the editor and edit again."; exit 1; }`,
      );
    }
  }
  for (const p of plan.properties) {
    L.push(
      `got=$(prop_value ${sq(p.repo)} ${sq(p.name)}) || { echo "STOP: could not read ${p.repo}'s properties. Nothing was written."; exit 1; }`,
      `[ "$got" = ${sq(p.from ?? "")} ] || { echo "STOP: ${p.repo} ${p.name} is now '$got', not what you edited. Nothing was written. Reload the editor."; exit 1; }`,
    );
  }
  L.push("", 'echo "This will do:"');
  for (const pr of plan.prs) {
    L.push(`echo ${sq(`  open a pull request on ${ORG}/${pr.repo}: ${pr.title}`)}`);
    for (const f of pr.files) for (const s of f.summary) L.push(`echo ${sq(`    ${f.file.path}: ${s}`)}`);
  }
  for (const p of plan.properties) {
    L.push(`echo ${sq(`  set property ${p.name} on ${p.repo}: ${p.from ?? "(not set)"} -> ${p.to ?? "(not set)"} (takes effect at once, no pull request)`)}`);
  }
  if (plan.properties.some((p) => p.endpoint === "org")) {
    L.push(`echo "  (an org-owned property needs gh's admin:org scope: gh auth refresh -s admin:org, and gh auth refresh --remove-scopes admin:org after)"`);
  }
  L.push(
    'printf "Type yes to go ahead: "',
    "read -r answer",
    '[ "$answer" = "yes" ] || { echo "Nothing was written."; exit 1; }',
    "",
    'STAMP=$(date -u +%Y%m%d-%H%M%S)',
  );
  plan.prs.forEach((pr, i) => {
    L.push(
      "",
      `B${i}="settings-editor/${pr.repo}-$STAMP"`,
      `BASE=$(gh api "repos/$O/${pr.repo}/git/ref/heads/main" --jq .object.sha) || { echo "STOP: could not read ${pr.repo} main. Pull requests above this line were opened; this one and the rest were not."; exit 1; }`,
      `gh api --method POST "repos/$O/${pr.repo}/git/refs" -f ref="refs/heads/$B${i}" -f sha="$BASE" >/dev/null || { echo "STOP: could not create branch $B${i} in ${pr.repo} (do you have write access?). Nothing more was written."; exit 1; }`,
    );
    for (const f of pr.files) {
      const content = Buffer.from(f.after, "utf8").toString("base64");
      L.push(
        `gh api --method PUT ${sq(contentsPath(f))} -f message=${sq(commitMessage(f))} -f content=${sq(content)}${f.baseSha ? ` -f sha=${sq(f.baseSha)}` : ""} -f branch="$B${i}" >/dev/null || { echo "STOP: could not write ${f.file.path} on $B${i} in ${pr.repo}. Delete that branch on GitHub if you want; nothing more was written."; exit 1; }`,
      );
    }
    L.push(
      `url=$(gh api --method POST "repos/$O/${pr.repo}/pulls" -f title=${sq(pr.title)} -f head="$B${i}" -f base=main -f body=${sq(pr.body)} --jq .html_url) || { echo "STOP: branch $B${i} is pushed in ${pr.repo} but the pull request was not opened. Open it on GitHub."; exit 1; }`,
      'echo "opened: $url"',
    );
  });
  for (const p of plan.properties) {
    const body =
      p.endpoint === "repo"
        ? { properties: [{ property_name: p.name, value: p.to }] }
        : { repository_names: [p.repo], properties: [{ property_name: p.name, value: p.to }] };
    const path = p.endpoint === "repo" ? `repos/$O/${p.repo}/properties/values` : "orgs/$O/properties/values";
    L.push(
      `gh api --method PATCH "${path}" --input - >/dev/null <<'JSON' || { echo "STOP: GitHub refused ${p.name} on ${p.repo}. Changes above this line were made; this one and the rest were not."; exit 1; }`,
      JSON.stringify(body),
      "JSON",
      `echo ${sq(`set: ${p.repo} ${p.name} = ${p.to ?? "(not set)"}`)}`,
    );
  }
  L.push('echo "Done."', ")");
  return `${L.join("\n")}\n`;
}
