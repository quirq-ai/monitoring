import type { TomlField } from "@/lib/editor/toml-fields";

// infra-config values that `python3 tools/qqcfg.py generate` reads (its render(), at infra-config
// b344eaf): change one and generated/ and .github/workflows/qq-required-*.yml are out of date, so
// the required `validate` check fails. The editor cannot regenerate them (it does not run qqcfg,
// and writing .github/workflows/ needs a scope it does not ask for), so it shows these values
// read-only and says how they are changed.

export const GENERATED_NOTE =
  "Read by qqcfg generate: change it in an infra-config checkout, run python3 tools/qqcfg.py generate (it also rewrites generated/ and .github/workflows/), and open that pull request.";

/** Whether `field` in the infra-config file `fileId` is read by qqcfg generate. */
export function isGenerateInput(fileId: string, field: TomlField, all: TomlField[]): boolean {
  const [top, index, key] = field.path;
  switch (fileId) {
    case "infra-config/config/org.toml":
      return top === "org" && index === "code_host";
    case "infra-config/config/repos.toml":
      return top === "repo" && key === "default_branch";
    case "infra-config/config/kinds.toml":
      // Every toolchain (its pin and provisioning), and what a kind runs and reports.
      return top === "toolchain" || (top === "kind" && ["toolchain", "capabilities", "interim", "test_reports"].includes(String(key)));
    case "infra-config/config/pipelines.toml": {
      if (top === "defaults") return true;
      if (top !== "builder" || typeof index !== "number") return false;
      // The flag itself, and every value of a builder that is generated.
      if (key === "generate") return true;
      return all.some((f) => f.path[0] === "builder" && f.path[1] === index && f.path[2] === "generate" && f.value === true);
    }
    default:
      return false;
  }
}
