import Link from "next/link";
import { CanaryStrip } from "@/components/canary-strip";
import { CellView } from "@/components/cell";
import { PageTitle } from "@/components/page-title";
import { SourceLink } from "@/components/source-link";
import { StateBadge } from "@/components/state-badge";
import { buildSnapshot, outcomeState } from "@/lib/model/build";

export default async function ReleasePage() {
  const snapshot = await buildSnapshot();
  const now = new Date(snapshot.generatedAt);
  const { release } = snapshot;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <PageTitle title="Release" lead="Where lkgr and each channel point, and how the daily canary went." />

      {release.channels.length ? (
        <p className="text-sm text-muted-foreground">
          Channels in order: {release.channels.map((c) => `${c.name} (${c.cadence || "no cadence"}, ${c.audience.join(" and ") || "no audience"})`).join(", then ")}.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">The channel order could not be read from infra-config; the Health page says why.</p>
      )}

      {release.repos.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">No product with channels was found in infra-config.</p>
      ) : null}

      {release.repos.map((r) => (
        <section key={r.repo} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
          <h2 className="text-xl">
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
                  <StateBadge state="unknown" />
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
        </section>
      ))}

      <section className="flex flex-col gap-2">
        <h2 className="text-xl">Latest canary report</h2>
        {release.report ? (
          <>
            <SourceLink source={`release-state reports/${release.report.date}.md`} url={release.report.url} now={now} />
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-card p-4 font-sans text-sm">{release.report.markdown}</pre>
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
