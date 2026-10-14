// The settings files the editor (/settings) can change, and what a merged change does. The
// files themselves are owned by their repos; this list only says where they are. A file that
// does not exist yet shows as unknown with the 404, never as empty.
//
// Each edit becomes a pull request on the repo that owns the file, so CODEOWNERS, required
// approvals and the merge queue there decide whether it lands. Nothing here writes to main.

export type SettingsFormat = "toml" | "codeowners";

export type SettingsGroup = "gates" | "policies" | "owners" | "manifests";

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
  { id: "gates", title: "Gates", blurb: "Merge rules, required checks and approvals, org workflows and pins." },
  { id: "policies", title: "Policies", blurb: "infra-config: reverts, channels, flakes, perf, rollers and the rest." },
  { id: "owners", title: "Owners", blurb: "Policy owners, rotations and each repo's CODEOWNERS." },
  { id: "manifests", title: "Repo manifests", blurb: "Each product's infra/repo.toml, shown read-only: qqsync edits them." },
];

const GATE_EFFECT =
  "Merged, it changes nothing on GitHub by itself: an org admin then runs gate's settings apply (scripts/apply.sh), which writes the rulesets and repo settings.";
const POLICY_EFFECT = "Read from infra-config main by the tools named in the file's [area] read_by once merged.";

function infraConfig(name: string, title: string, group: SettingsGroup = "policies"): SettingsFile {
  return { id: `infra-config/config/${name}`, group, repo: "infra-config", branch: "main", path: `config/${name}`, format: "toml", title, effect: POLICY_EFFECT };
}

export const FIXED_FILES: SettingsFile[] = [
  { id: "gate/settings/github.toml", group: "gates", repo: "gate", branch: "main", path: "settings/github.toml", format: "toml", title: "Rulesets and repo settings", effect: GATE_EFFECT },
  infraConfig("gate.toml", "Gate policy: merge queue, admission, change classes", "gates"),
  {
    id: "gate/pins.toml",
    group: "gates",
    repo: "gate",
    branch: "main",
    path: "pins.toml",
    format: "toml",
    title: "Commits gate reads (pins)",
    effect: "gate reads infra-config and sync at these commits once merged.",
  },
  infraConfig("auto_revert.toml", "Auto-revert caps"),
  infraConfig("channels.toml", "Channels and the canary schedule"),
  infraConfig("flakes.toml", "Flakes and quarantine"),
  infraConfig("fuzz.toml", "Fuzzing"),
  infraConfig("health.toml", "Health probes"),
  infraConfig("kinds.toml", "Repo kinds and toolchains"),
  infraConfig("perf.toml", "Perf"),
  infraConfig("pipelines.toml", "Builders and pipelines"),
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
    effect: "qq and sync read it from the repo's main once merged.",
    // The manifest's own header: "Read and edit it only through qqsync ... no other parser."
    readOnly: "Shown read-only: its header says to edit it only through qqsync (qqsync show, qqsync pin), and rollers move its pins.",
  };
}
