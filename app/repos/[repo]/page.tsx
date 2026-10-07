import { ArrowUpRight } from "lucide-react";
import { notFound } from "next/navigation";
import { ApiBanner } from "@/components/api-banner";
import { CanaryStrip } from "@/components/canary-strip";
import { CellView } from "@/components/cell";
import { PageTitle } from "@/components/page-title";
import { Sha } from "@/components/sha";
import { SourceLink } from "@/components/source-link";
import { StateBadge } from "@/components/state-badge";
import { TimeAgo } from "@/components/time-ago";
import { Card } from "@/components/ui/card";
import { web } from "@/lib/github";
import { buildRepoView } from "@/lib/model/repo";
import { exactUtc } from "@/lib/model/time";

export default async function RepoPage({ params }: PageProps<"/repos/[repo]">) {
  const { repo } = await params;
  const view = await buildRepoView(repo);
  if (!view) notFound();
  if ("unavailable" in view) {
    // Not a 404: the registries that would name the repo could not be read, so nothing is known.
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <PageTitle title={repo} lead="Could not be looked up." />
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <StateBadge state="unknown" /> The registries could not be read: {view.unavailable}
        </p>
      </div>
    );
  }
  const { row, release, pulls, checks, tree, perf } = view;
  const now = new Date(view.snapshot.generatedAt);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <PageTitle title={row.name} lead={row.description || `${row.group} repo`}>
        <a href={row.url} className="inline-flex min-h-11 w-fit items-center gap-1 rounded-md border border-border bg-card px-3 text-sm text-card-foreground transition-colors hover:bg-muted md:min-h-9" rel="noreferrer">
          open on GitHub <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </a>
      </PageTitle>
      <ApiBanner api={view.snapshot.health.api} />

      <Card className="grid grid-cols-2 gap-5 rounded-xl px-4 py-4 shadow-none sm:grid-cols-3 sm:px-5 sm:py-5 lg:grid-cols-6">
        <CellView title={`CI on ${row.defaultBranch}`} cell={row.ci} now={now} exact />
        <CellView title="last merge" cell={row.lastMerge} now={now} exact />
        {row.tree ? <CellView title="tree" cell={row.tree} now={now} /> : null}
        {row.lkgr ? <CellView title="lkgr" cell={row.lkgr} now={now} exact /> : null}
        {row.canary ? <CellView title="canary" cell={row.canary} now={now} exact /> : null}
        {row.deploy ? <CellView title="deploy" cell={row.deploy} now={now} exact /> : null}
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg">Open pull requests</h2>
        {pulls.ok ? (
          pulls.value.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border bg-card text-card-foreground">
              {pulls.value.map((pr) => (
                <li key={pr.number} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm">
                  <a href={pr.url} className="break-words underline-offset-2 hover:underline" rel="noreferrer">
                    #{pr.number} {pr.title}
                    {pr.draft ? <span className="ml-1.5 rounded-full border border-border px-1.5 text-xs text-muted-foreground">draft</span> : null}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    by {pr.author}
                    {pr.assignees.length ? `, assigned to ${pr.assignees.join(", ")}` : ""} · updated <TimeAgo iso={pr.updatedAt} now={now} /> ({exactUtc(pr.updatedAt)})
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">None open.</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            <StateBadge state="unknown" /> {pulls.reason}
          </p>
        )}
        <SourceLink source="GitHub pull requests" url={web.pulls(row.name)} now={now} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg">Checks on {row.defaultBranch}</h2>
        {checks.ok ? (
          <>
            {checks.value.headSha ? (
              <p className="text-sm">
                head <Sha sha={checks.value.headSha} url={web.commit(row.name, checks.value.headSha)} />
              </p>
            ) : null}
            {checks.value.checks.length ? (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border bg-card text-card-foreground">
                {checks.value.checks.map((c, i) => (
                  <li key={`${c.name}-${i}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                    <StateBadge state={c.conclusion === "success" ? "green" : c.status !== "completed" ? "pending" : c.conclusion === "neutral" || c.conclusion === "skipped" ? "unknown" : "red"} />
                    <a href={c.url} className="break-words underline-offset-2 hover:underline" rel="noreferrer">
                      {c.name}
                    </a>
                    <span className="text-xs text-muted-foreground">
                      {c.status === "completed" ? c.conclusion : c.status}
                      {c.completedAt ? `, ${exactUtc(c.completedAt)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No check runs on the head commit.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            <StateBadge state="unknown" /> {checks.reason}
          </p>
        )}
      </section>

      {tree ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg">Tree</h2>
          {tree.ok ? (
            <>
              <p className="text-sm">
                <StateBadge state={tree.value.state === "open" ? "green" : tree.value.state === "closed" ? "red" : "unknown"} /> {tree.value.reason || tree.value.state}
                {tree.value.green ? (
                  <>
                    {" · last green "}
                    <Sha sha={tree.value.green} url={web.commit(row.name, tree.value.green)} />
                  </>
                ) : null}
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                {Object.entries(tree.value.builders).map(([name, b]) => (
                  <li key={name} className="flex flex-wrap items-center gap-2">
                    <StateBadge state={b.state === "green" ? "green" : b.state === "red" ? "red" : b.state === "pending" ? "pending" : "unknown"} />
                    <a href={b.url || tree.sourceUrl} className="underline-offset-2 hover:underline" rel="noreferrer">
                      {name}
                    </a>
                    {b.commit ? <Sha sha={b.commit} url={web.commit(row.name, b.commit)} /> : null}
                  </li>
                ))}
              </ul>
              {tree.value.red.length ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {tree.value.red.map((r, i) => (
                    <li key={i}>
                      red since {r.since ?? "?"}: {r.builder ?? "builder"} first bad {r.first_bad?.slice(0, 7) ?? "?"}, last good {r.last_good?.slice(0, 7) ?? "?"}
                    </li>
                  ))}
                </ul>
              ) : null}
              <SourceLink source="gardener tree-status" url={tree.sourceUrl} now={now} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              <StateBadge state="unknown" /> {tree.reason}
            </p>
          )}
        </section>
      ) : null}

      {release ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg">Canary, last {release.days.length} days</h2>
          <CanaryStrip days={release.days} repo={row.name} />
        </section>
      ) : null}

      {row.product ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg">Perf</h2>
          {view.perfReason ? (
            <p className="text-sm text-muted-foreground">
              <StateBadge state="unknown" /> <span className="break-words">{view.perfReason}</span>
            </p>
          ) : perf.length === 0 ? (
            <p className="text-sm text-muted-foreground">No metrics recorded.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {perf.map((m) => (
                <li key={m.metric} className="flex flex-col gap-1 rounded-xl border bg-card p-3 text-sm text-card-foreground">
                  <a href={m.url} className="font-medium underline-offset-2 hover:underline" rel="noreferrer">
                    {m.metric}
                  </a>
                  {m.latest ? (
                    <>
                      <span className="font-mono">
                        {m.latest.values.map((v) => `${v.name} ${v.value}${v.unit ? ` ${v.unit}` : ""}`).join(", ") || m.latest.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {m.count} records, latest at {exactUtc(m.latest.recorded_at)} for <Sha sha={m.latest.commit} url={web.commit(row.name, m.latest.commit)} />
                      </span>
                    </>
                  ) : (
                    <span className="text-xs break-words text-muted-foreground">{m.reason ?? "no records"}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
