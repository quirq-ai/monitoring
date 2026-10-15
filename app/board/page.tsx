import Link from "next/link";
import { ApiBanner } from "@/components/api-banner";
import { Board, BoardOverview, type ShownGroup } from "@/components/board-notes";
import { PageTitle } from "@/components/page-title";
import { Card } from "@/components/ui/card";
import { needsLook } from "@/lib/model/board-view";
import { buildSnapshot } from "@/lib/model/build";
import { cn } from "@/lib/utils";

// A group with more repos than this gets a board of its own across the page; the smaller ones
// share a row. Products always get their own.
const SHARED_ROW_MAX = 7;

export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  const params = await searchParams;
  // The one filter is a fixed choice, checked here; it never reaches a fetch (rule 7).
  const look = params.show === "look";
  const snapshot = await buildSnapshot();
  const apiOk = snapshot.health.api.state === "ok";
  const all = snapshot.board.flatMap((g) => g.repos);
  const shown: ShownGroup[] = snapshot.board.map((group) => ({
    group,
    rows: look ? group.repos.filter((row) => needsLook(row, apiOk)) : group.repos,
    wide: group.id !== "products" && group.repos.length > SHARED_ROW_MAX,
  }));
  const own = shown.filter((s) => s.group.id === "products" || s.wide);
  const shared = shown.filter((s) => s.group.id !== "products" && !s.wide);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageTitle title="Board" lead="Every repo as a note, one board per group. The overview is the index: pick a repo to jump to its note.">
        <nav aria-label="Show" className="inline-flex w-fit gap-0.5 rounded-lg bg-muted p-0.5 text-sm">
          {([
            ["all", "/board", "all notes"],
            ["look", "/board?show=look", "needs a look"],
          ] as const).map(([key, href, label]) => (
            <Link
              key={key}
              href={href}
              aria-current={(key === "look") === look ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-md px-3 transition-colors md:min-h-8",
                (key === "look") === look ? "border border-border bg-card font-medium text-card-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </PageTitle>
      <ApiBanner api={snapshot.health.api} />
      {snapshot.unregistered.length ? (
        <Card className="rounded-xl p-4 text-sm wrap-anywhere shadow-none">
          Not in any registry: {snapshot.unregistered.join(", ")}. Add them to infra-config, the gate or this repo&apos;s config/repos.json.
        </Card>
      ) : null}
      <BoardOverview shown={shown} total={all} />
      {own.map((s) => (
        <Board key={s.group.id} {...s} apiOk={apiOk} />
      ))}
      {shared.length ? (
        <div className="grid items-start gap-6 lg:grid-cols-3 lg:gap-5">
          {shared.map((s) => (
            <Board key={s.group.id} {...s} apiOk={apiOk} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
