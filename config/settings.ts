// The settings files the editor (/settings) can change, and what a merged change does. The
// files themselves are owned by their repos; this list only says where they are. A file that
// does not exist yet shows as unknown with the 404, never as empty.
//
// Each edit becomes a pull request on the repo that owns the file, so CODEOWNERS, required
// approvals and the merge queue there decide whether it lands. Nothing here writes to main.

/** `commit`: a file that holds one 40-character commit id and nothing else. */
export type SettingsFormat = "toml" | "codeowners" | "commit";

export type SettingsGroup = "gates" | "pins" | "policies" | "owners" | "manifests";

export type SettingsFile = {
  /** Stable id, e.g. `gate/settings/github.toml`. The only thing a browser may name. */
  id: string;
  group: SettingsGroup;
  repo: string;
  branch: string;
  path: string;
  format: SettingsFormat;
  title: string;
  /** What happens after the pull request merges. */
  effect: string;
  /** Set when the file must not be edited here, saying how it is edited instead. */
  readOnly?: string;
};

export const GROUPS: { id: SettingsGroup; title: string; blurb: string }[] = [
  { id: "gates", title: "Gates", blurb: "Merge rules, required checks and approvals, org workflows and the guard's terms." },
  { id: "pins", title: "Pins", blurb: "The commits each tool reads infra-config and the other qq repos at." },
  { id: "policies", title: "Policies", blurb: "infra-config: reverts, channels, flakes, perf, rollers and the rest." },
  { id: "owners", title: "Owners", blurb: "Policy owners, rotations and each repo's CODEOWNERS." },
  { id: "manifests", title: "Repo manifests", blurb: "Each product's infra/repo.toml, linked only: qqsync reads and edits them." },
];

const APPLY = "an org admin runs gate's settings apply (scripts/apply.sh), which writes the rulesets and repo settings";
const GATE_EFFECT = `nothing changes on GitHub by itself; that happens when ${APPLY}.`;
// None of the tools that read infra-config reads its main: each reads it at a commit pinned in its
// own repo (gate/README.md "How it works", gate scripts/apply.sh refuses any other commit).
const POLICY_EFFECT =
  "nothing changes by itself. The tools in the file's [area] read_by take it up when they move their pin of infra-config past this merge: gate, gardener, release and installer pin it in pins.toml (under Pins here), rollers in infra-config.commit, and recipes and sync in a ref: in their own .github/workflows/presubmit.yml, which this editor cannot move. None of them reads infra-config main.";
// kinds.toml and pipelines.toml also feed qqcfg generate (lib/editor/generated.ts).
const GENERATE_EFFECT = `${POLICY_EFFECT} The values qqcfg generate reads are shown read-only: change those in a checkout and run python3 tools/qqcfg.py generate, which rewrites generated/ and .github/workflows/ to match.`;

function infraConfig(name: string, title: string, group: SettingsGroup = "policies", effect = POLICY_EFFECT): SettingsFile {
  return { id: `infra-config/config/${name}`, group, repo: "infra-config", branch: "main", path: `config/${name}`, format: "toml", title, effect };
}

function pins(repo: string, reads: string): SettingsFile {
  return {
    id: `${repo}/pins.toml`,
    group: "pins",
    repo,
    branch: "main",
    path: "pins.toml",
    format: "toml",
    title: `${repo} pins`,
    effect: `${repo} reads ${reads} at these commits from its next run.`,
  };
}

export const FIXED_FILES: SettingsFile[] = [
  { id: "gate/settings/github.toml", group: "gates", repo: "gate", branch: "main", path: "settings/github.toml", format: "toml", title: "Rulesets and repo settings", effect: GATE_EFFECT },
  infraConfig(
    "gate.toml",
    "Gate policy: merge queue, admission, change classes",
    "gates",
    `${POLICY_EFFECT} For the gate, that is gate's pins.toml; the rulesets on GitHub then change only when ${APPLY}.`,
  ),
  {
    id: "gate/guard/terms.toml",
    group: "gates",
    repo: "gate",
    branch: "main",
    path: "guard/terms.toml",
    format: "toml",
    title: "Agnosticism guard terms",
    effect:
      "gate's own presubmit uses the new terms at once: its required guard over gate, and a non-required sweep (settings-drift) over every core repo. The other repos run the guard from a pinned gate: gardener, release and test-pipelines in pins.toml, qq at a gate ref: in its .github/workflows/presubmit.yml; each uses the new terms once that pin moves past this merge.",
  },
  { ...pins("gate", "infra-config and sync"), effect: `gate reads infra-config and sync at these commits; the rulesets on GitHub change only when ${APPLY}.` },
  pins("gardener", "infra-config, test-pipelines and gate"),
  pins("release", "infra-config and gate"),
  pins("installer", "release, infra-config, xo-space's install.sh and gardener"),
  pins("test-pipelines", "gate"),
  {
    id: "rollers/infra-config.commit",
    group: "pins",
    repo: "rollers",
    branch: "main",
    path: "infra-config.commit",
    format: "commit",
    title: "rollers pin of infra-config",
    effect: "rollers reads infra-config at this commit from its next run.",
  },
  infraConfig("auto_revert.toml", "Auto-revert caps"),
  infraConfig("channels.toml", "Channels and the canary schedule"),
  infraConfig("flakes.toml", "Flakes and quarantine"),
  infraConfig("fuzz.toml", "Fuzzing"),
  infraConfig("health.toml", "Health probes"),
  infraConfig("kinds.toml", "Repo kinds and toolchains", "policies", GENERATE_EFFECT),
  infraConfig("perf.toml", "Perf"),
  infraConfig("pipelines.toml", "Builders and pipelines", "policies", GENERATE_EFFECT),
  infraConfig("postmortem.toml", "Postmortems"),
  infraConfig("rollers.toml", "Rollers"),
  infraConfig("repos.toml", "Product repos"),
  infraConfig("org.toml", "Org: roles, repo owners, rotations, budget", "owners"),
];

/** Each repo's CODEOWNERS, where GitHub looks first. */
export function codeownersFile(repo: string): SettingsFile {
  return {
    id: `${repo}/.github/CODEOWNERS`,
    group: "owners",
    repo,
    branch: "main",
    path: ".github/CODEOWNERS",
    format: "codeowners",
    title: `${repo} CODEOWNERS`,
    effect: "GitHub asks these owners to review matching changes as soon as it merges (when the repo's ruleset requires code-owner review, their approval is needed to merge).",
  };
}

/** A product's manifest. */
export function manifestFile(repo: string): SettingsFile {
  return {
    id: `${repo}/infra/repo.toml`,
    group: "manifests",
    repo,
    branch: "main",
    path: "infra/repo.toml",
    format: "toml",
    title: `${repo} infra/repo.toml`,
    effect: "qqsync changes it in its own pull requests.",
    // The manifest's own header: "Read and edit it only through qqsync ... no other parser." So the
    // editor does not read it at all, and only links to it.
    readOnly: "Not read or edited here: its header says to read and edit it only through qqsync (qqsync show, qqsync pin), and rollers move its pins.",
  };
}
