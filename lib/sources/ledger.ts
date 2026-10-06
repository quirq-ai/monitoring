import { z } from "zod";
import { parseValue, treeUrl } from "@/lib/fetch";
import { ghGet, repoPath } from "@/lib/github";
import { failSignal, okSignal, type Signal } from "@/lib/signal";

// gardener ledger reverts/<id>.json and landed/<id>.json. The branch does not exist until the
// gardener App does, so a 404 reads `ledger not started`, which is the honest state today.
// Record shape from gardener src/qqgarden/ledger.py (Entry) at bf7d24d.

const REPO = "gardener";
const BRANCH = "ledger";
const REVALIDATE = 300;

const EntrySchema = z.object({ name: z.string(), type: z.string(), download_url: z.string().nullable().optional() }).loose();

export type LedgerSummary = { reverts: number; landed: number; newest: string[] };

export async function readLedger(): Promise<Signal<LedgerSummary>> {
  const source = "gardener/ledger";
  const sourceUrl = treeUrl(REPO, BRANCH);
  const [reverts, landed] = await Promise.all([listDir("reverts"), listDir("landed")]);
  if (!reverts.ok) {
    if (reverts.status === 404) return failSignal(source, sourceUrl, "ledger not started");
    return failSignal(source, sourceUrl, `ledger: ${reverts.reason}`);
  }
  const revertNames = parseNames(reverts.data);
  if (!revertNames.ok) return failSignal(source, sourceUrl, revertNames.reason);
  const landedNames = landed.ok ? parseNames(landed.data) : { ok: true as const, value: [] as string[] };
  if (!landedNames.ok) return failSignal(source, sourceUrl, landedNames.reason);
  return okSignal(source, sourceUrl, {
    reverts: revertNames.value.length,
    landed: landedNames.value.length,
    newest: revertNames.value.slice(-5).reverse(),
  });
}

function listDir(dir: string) {
  return ghGet<unknown>(repoPath(REPO, `contents/${dir}`), { revalidate: REVALIDATE, params: { ref: BRANCH } });
}

function parseNames(data: unknown): { ok: true; value: string[] } | { ok: false; reason: string } {
  const parsed = parseValue(z.array(EntrySchema), data, "ledger: directory listing");
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value.filter((e) => e.type === "file").map((e) => e.name.replace(/\.json$/, "")) };
}
