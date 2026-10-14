import type { TomlField } from "@/lib/editor/toml-fields";

// infra-config values that `python3 tools/qqcfg.py generate` reads (its render(), at infra-config
// b344eaf): change one and generated/ and .github/workflows/qq-required-*.yml are out of date, so
// the required `validate` check fails. The editor cannot regenerate them (it does not run qqcfg,
// and writing .github/workflows/ needs a scope it does not ask for), so it shows these values
// read-only and says how they are changed. The names those values refer to (a kind, a pool, a
// repo) are locked too: renaming one fails validate's reference check, and the editor cannot
// rename the references it locks.

export const GENERATED_NOTE =
  "Read by qqcfg generate: change it in an infra-config checkout, run python3 tools/qqcfg.py generate (it also rewrites generated/ and .github/workflows/), and open that pull request. Product repos get the change when qqcfg deliver <repo> redelivers their stubs.";

/** The short form for the second and later locked values of one section. */
export const GENERATED_SHORT = "Read by qqcfg generate (see the first value of this section).";

/** Whether `field` in the infra-config file `fileId` is read by qqcfg generate. */
export function isGenerateInput(fileId: string, field: TomlField, all: TomlField[]): boolean {
  const [top, index, key] = field.path;
  switch (fileId) {
    case "infra-config/config/org.toml":
      // A pool's runner (each generated job's runs-on) and the name builders refer to it by.
      return (top === "org" && index === "code_host") || (top === "pool" && (key === "github" || key === "name"));
    case "infra-config/config/repos.toml":
      return top === "repo" && (key === "default_branch" || key === "name");
    case "infra-config/config/kinds.toml":
      // Every toolchain (its pin and provisioning; `track` is the rollers'), and a kind's name and
      // what it runs and reports.
      if (top === "toolchain") return key !== "track";
      return top === "kind" && ["name", "toolchain", "capabilities", "interim", "test_reports"].includes(String(key));
    case "infra-config/config/pipelines.toml": {
      // drift_grace_days is read by check-delivered, not by generate.
      if (top === "defaults") return index !== "drift_grace_days";
      if (top !== "builder" || typeof index !== "number") return false;
      // The flag itself, and every value of a builder that is generated.
      if (key === "generate") return true;
      return all.some((f) => f.path[0] === "builder" && f.path[1] === index && f.path[2] === "generate" && f.value === true);
    }
    default:
      return false;
  }
}
