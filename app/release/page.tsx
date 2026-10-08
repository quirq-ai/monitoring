import Link from "next/link";
import { ApiBanner } from "@/components/api-banner";
import { CanaryStrip } from "@/components/canary-strip";
import { CellView } from "@/components/cell";
import { Markdown } from "@/components/markdown";
import { PageTitle } from "@/components/page-title";
import { SourceLink } from "@/components/source-link";
import { StateBadge } from "@/components/state-badge";
import { Card } from "@/components/ui/card";
import { buildSnapshot, outcomeState } from "@/lib/model/build";

export default async function ReleasePage() {
  const snapshot = await buildSnapshot();
  const now = new Date(snapshot.generatedAt);
  const { release } = snapshot;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <PageTitle title="Release" lead="Where lkgr and each channel point, and how the daily canary went." />
      <ApiBanner api={snapshot.health.api} />

      {release.channels.length ? (
        <p className="text-sm text-muted-foreground">
          Channels in order: {release.channels.map((c) => `${c.name} (${c.cadence || "no cadence"}, ${c.audience.join(" and ") || "no audience"})`).join(", then ")}.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">The channel order could not be read from infra-config; the Health page says why.</p>
      )}

      {release.repos.length === 0 ? (
        <Card className="rounded-xl p-4 text-sm shadow-none">
          {release.reposReason ? (
            <span className="flex flex-wrap items-center gap-2">
              <StateBadge state="unknown" /> The product registry could not be read: {release.reposReason}
            </span>
          ) : (
            <span className="text-muted-foreground">No product with channels is listed in infra-config.</span>
          )}
        </Card>
      ) : null}

      {release.repos.map((r) => (
        <Card key={r.repo} className="gap-5 rounded-xl px-4 py-4 shadow-none sm:px-5 sm:py-5">
          <h2 className="text-lg">
            <Link href={`/repos/${r.repo}`} className="underline-offset-2 hover:underline">
              {r.repo}
            </Link>
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <CellView title="lkgr" cell={r.lkgr} now={now} />
            {Object.entries(r.channels).map(([name, cell]) => (
              <CellView key={name} title={name} cell={cell} now={now} />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-muted-foreground">canary</span>
              {r.latest ? (
                <>
                  <StateBadge state={outcomeState(r.latest.outcome)} />
                  <a href={r.latest.url} className="underline-offset-2 hover:underline" rel="noreferrer">
                    {r.latest.date}: {r.latest.outcome}
                    {r.latest.reason ? `, ${r.latest.reason}` : ""}
                  </a>
                </>
              ) : (
                <>
                  <StateBadge state="stale" />
                  <span>no run in the last {r.days.length} days</span>
                </>
              )}
            </span>
            <CanaryStrip days={r.days} repo={r.repo} />
            {r.hold ? (
              <p className="text-sm">
                <StateBadge state="held" /> held at {r.hold.stage} since {r.hold.date}, commit{" "}
                <a href={r.hold.url} className="font-mono underline-offset-2 hover:underline" rel="noreferrer">
                  {r.hold.commit.slice(0, 7)}
                </a>
                {r.hold.runUrl ? (
                  <>
                    {" · "}
                    <a href={r.hold.runUrl} className="underline-offset-2 hover:underline" rel="noreferrer">
                      the run
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </Card>
      ))}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg">Latest canary report</h2>
        {release.report ? (
          <>
            <SourceLink source={`release-state reports/${release.report.date}.md`} url={release.report.url} now={now} />
            <Card className="rounded-xl px-4 py-4 shadow-none sm:px-6 sm:py-6">
              <Markdown text={release.report.markdown} />
            </Card>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            <StateBadge state="unknown" /> {release.reportReason}
          </p>
        )}
      </section>
    </div>
  );
}
