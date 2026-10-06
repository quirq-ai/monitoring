import { buildSnapshot } from "@/lib/model/build";
import { parseWindow } from "@/lib/model/time";
import { SnapshotSchema } from "@/lib/model/types";

// GET only: the model as JSON, validated against its own schema before it leaves. Nothing in it
// is a secret: it is what the pages show, from public data.

export async function GET(request: Request): Promise<Response> {
  const window = parseWindow(new URL(request.url).searchParams.get("since"));
  const snapshot = await buildSnapshot({ window });
  const checked = SnapshotSchema.safeParse(snapshot);
  if (!checked.success) {
    return Response.json({ error: "snapshot does not match its schema", issues: checked.error.issues.slice(0, 5) }, { status: 500 });
  }
  return Response.json(checked.data, { headers: { "cache-control": "public, max-age=60" } });
}
