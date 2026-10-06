import Link from "next/link";
import { CountTiles } from "@/components/count-tiles";
import { PageTitle } from "@/components/page-title";
import { StateBadge } from "@/components/state-badge";
import { TimeAgo } from "@/components/time-ago";
import { buildSnapshot } from "@/lib/model/build";
import { parseWindow } from "@/lib/model/time";
import { cn } from "@/lib/utils";

export default async function TodayPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const window = parseWindow(typeof params.since === "string" ? params.since : undefined);
  const snapshot = await buildSnapshot({ window });
  const now = new Date(snapshot.generatedAt);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageTitle title="Today" lead="What changed, newest first, and what needs you.">
        <nav aria-label="Window" className="flex gap-1 text-sm">
          {(["24h", "7d"] as const).map((w) => (
            <Link
              key={w}
              href={w === "24h" ? "/" : "/?since=7d"}
              aria-current={w === window ? "page" : undefined}
              className={cn("rounded-md border border-border px-3 py-1", w === window ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              last {w === "24h" ? "24 hours" : "7 days"}
            </Link>
          ))}
        </nav>
      </PageTitle>

      <CountTiles counts={snapshot.counts} />

      {snapshot.today.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Nothing changed in the last {window === "24h" ? "24 hours" : "7 days"} that the sources know about.
          {snapshot.counts.unknownOrStale ? " Some sources are down; the Health page says which." : ""}
        </p>
      ) : (
        <ol className="divide-y divide-border rounded-lg border border-border bg-card">
          {snapshot.today.map((item, i) => (
            <li key={`${item.kind}-${item.at}-${i}`} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3">
              <span className="flex shrink-0 items-center gap-2 sm:w-44">
                <StateBadge state={item.state} />
                <Link href={`/repos/${item.repo}`} className="text-sm font-medium underline-offset-2 hover:underline">
                  {item.repo}
                </Link>
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <a href={item.url} className="text-sm underline-offset-2 hover:underline" rel="noreferrer">
                  {item.title}
                  {item.demo ? <span className="ml-1 rounded bg-muted px-1 text-xs text-muted-foreground">planted demo, not counted</span> : null}
                </a>
                <TimeAgo iso={item.at} now={now} className="text-xs text-muted-foreground" />
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="text-xs text-muted-foreground">
        Generated <TimeAgo iso={snapshot.generatedAt} now={new Date()} exact />. Raw files can be up to 5 minutes old; the search index a minute or two.{" "}
        <Link href="/health" className="underline-offset-2 hover:underline">
          Every source and its state
        </Link>
        .
      </p>
    </div>
  );
}
