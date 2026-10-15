import { z } from "zod";
import { blobUrl, fetchRaw, parseJson, schemaReason } from "@/lib/fetch";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// gardener tree-status groups/groups.json (qq-gardener-groups/1, gardener src/qqgarden/groupsfile.py):
// per red range, its builders, first red runs, failure type and failed steps. The tree-status job
// writes it from the status files it has just published, in a step that runs after the status push
// and can fail on its own, so it can be a run behind the status files: the model matches each red
// range to its entry and calls anything that does not match unknown.

const REPO = "gardener";
const BRANCH = "tree-status";
const PATH = "groups/groups.json";
const SCHEMA = "qq-gardener-groups/1";
/** The same window as the status files it is read beside. */
const REVALIDATE = 120;

const GroupSchema = z
  .object({
    repo: z.string(),
    last_good: z.string(),
    first_bad: z.string(),
    builders: z.array(z.string()),
    runs: z.array(z.string()),
    kind: z.enum(["infra", "build", "test", "unknown"]),
    failed_steps: z.array(z.string()),
  })
  .loose();

const GroupsSchema = z.object({ schema: z.string(), groups: z.array(GroupSchema) });

export type TreeGroup = z.infer<typeof GroupSchema>;

export async function readTreeGroups(): Promise<Signal<TreeGroup[]>> {
  const source = "gardener/tree-status/groups";
  const sourceUrl = blobUrl(REPO, BRANCH, PATH);
  const raw = await fetchRaw(REPO, BRANCH, PATH, REVALIDATE);
  if (!raw.ok) {
    const why = raw.status === 404 ? `${PATH} is not published yet` : raw.reason;
    return failSignal(source, sourceUrl, `tree-status: ${why}`, raw);
  }
  const parsed = parseJson(GroupsSchema, raw.text, `tree-status: ${PATH}`);
  if (!parsed.ok) return failSignal(source, sourceUrl, parsed.reason, raw);
  if (parsed.value.schema !== SCHEMA) {
    return failSignal(source, sourceUrl, schemaReason(`tree-status: ${PATH}`, parsed.value.schema, SCHEMA), raw);
  }
  return okSignal(source, sourceUrl, parsed.value.groups, undefined, raw);
}
