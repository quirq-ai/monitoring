import { ApiBanner, apiTitles } from "@/components/api-banner";
import { CellView } from "@/components/cell";
import { PageTitle } from "@/components/page-title";
import { SourceLink } from "@/components/source-link";
import { SourcesList } from "@/components/sources-list";
import { StateBadge } from "@/components/state-badge";
import { TimeAgo } from "@/components/time-ago";
import { Card } from "@/components/ui/card";
import { buildSnapshot } from "@/lib/model/build";

export default async function HealthPage() {
  const snapshot = await buildSnapshot();
  const now = new Date(snapshot.generatedAt);
  const { health } = snapshot;
  const down = snapshot.sources.filter((s) => !s.ok).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <PageTitle title="Health" lead="Are the scheduled writers running on time, and is every source readable?" />
      <ApiBanner api={snapshot.health.api} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">Writers</h2>
        <p className="text-sm text-muted-foreground">
          Judged on the newest completed run, cancelled and skipped ones aside. Stale means no run inside the window, which on quiet repos is often GitHub delaying a schedule: look, do not panic.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {health.writers.map((w) => (
            <li key={w.id}>
              <Card className="h-full gap-1 rounded-xl px-4 py-4 shadow-none">
              <span className="flex items-center justify-between gap-2">
                <a href={w.url} className="font-medium underline-offset-2 hover:underline" target="_blank" rel="noopener noreferrer">
                  {w.id}
                </a>
                <StateBadge state={w.state} />
              </span>
              <span className="text-xs text-muted-foreground">
                {w.interval} · {w.writes}
              </span>
              <span className="text-sm">{w.reason}</span>
              {w.lastRun ? (
                <a href={w.lastRun.url} className="text-xs text-muted-foreground underline-offset-2 hover:underline" target="_blank" rel="noopener noreferrer">
                  last run {w.lastRun.conclusion}, <TimeAgo iso={w.lastRun.at} now={now} />
                </a>
              ) : null}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-xl px-4 py-4 shadow-none">
          <CellView title="gardener ledger" cell={health.ledger} now={now} />
        </Card>
        <Card className="gap-1 rounded-xl px-4 py-4 shadow-none">
          <span className="text-xs text-muted-foreground">GitHub API</span>
          <StateBadge state={health.api.state === "ok" ? "green" : "unknown"} />
          <span className="text-sm">{health.api.state === "ok" ? "answering, with a token" : `${apiTitles[health.api.state]}: ${health.api.text}`}</span>
        </Card>
        <Card className="gap-1 rounded-xl px-4 py-4 shadow-none">
          <span className="text-xs text-muted-foreground">API budget</span>
          <span className="text-3xl font-semibold tracking-tight tabular-nums">{health.apiRequestsThisHour}</span>
          <span className="text-sm text-muted-foreground">
            calls this server process made this hour, cached answers included (on Vercel, per instance). A test holds one cold snapshot to at most 70; the target is under 500 an hour.
          </span>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">Scorecard</h2>
        {health.scorecard ? (
          <>
            <SourceLink source="test-pipelines results/scorecard.json" url={health.scorecard.url} at={health.scorecard.generatedAt} now={now} label="as of" />
            <div className="grid gap-3 md:grid-cols-3">
              {health.scorecard.repos.map((r) => (
                <Card key={r.repo} className="gap-2 rounded-xl px-4 py-4 shadow-none">
                  <span className="font-medium">{r.repo}</span>
                  <dl className="flex flex-col gap-2 text-sm">
                    {r.metrics.map((m) => (
                      <div key={m.name} className="flex flex-col">
                        <dt className="text-xs text-muted-foreground" title={m.detail}>
                          {m.name}
                        </dt>
                        <dd className="tabular-nums">
                          {m.value === null ? "not measured" : `${m.value}${m.unit ? ` ${m.unit}` : ""}`}
                          {m.target ? <span className="text-xs text-muted-foreground"> (target {m.target})</span> : null}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              ))}
            </div>
            {health.scorecard.notMeasured.length ? (
              <details className="rounded-xl border bg-card p-4 text-sm text-card-foreground">
                <summary className="cursor-pointer">{health.scorecard.notMeasured.length} metrics not measured yet</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {health.scorecard.notMeasured.map((m) => (
                    <li key={m.name}>
                      <span className="font-medium">{m.name}</span>
                      {m.waitingOn ? <span className="text-muted-foreground"> waiting on {m.waitingOn}</span> : null}
                      {m.detail ? <span className="text-muted-foreground">: {m.detail}</span> : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            <StateBadge state="unknown" /> {health.scorecardReason}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">Sources</h2>
        <p className="text-sm text-muted-foreground">
          {snapshot.sources.length} reads for this page, {down} unreadable. Each line links to the file or API page it came from.
        </p>
        <SourcesList sources={snapshot.sources} now={now} />
      </section>
    </div>
  );
}
