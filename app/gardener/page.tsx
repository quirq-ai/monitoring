import { ApiBanner } from "@/components/api-banner";
import { CellView } from "@/components/cell";
import { PageTitle } from "@/components/page-title";
import { Sha } from "@/components/sha";
import { SourceLink } from "@/components/source-link";
import { SourcesList } from "@/components/sources-list";
import { StateBadge } from "@/components/state-badge";
import { TimeAgo } from "@/components/time-ago";
import { Card } from "@/components/ui/card";
import { web } from "@/lib/github";
import { buildGardener, githubUrl, type CoverageEntry, type RepoTree } from "@/lib/model/gardener";
import { exactUtc } from "@/lib/model/time";

// One question: is main green in the repos the gardener watches, and is the gardener working?
// Each section is one part of the answer. Read-only: nothing here re-runs, reverts or dispatches.

const link = "underline-offset-2 hover:underline";

export default async function GardenerPage() {
  const view = await buildGardener();
  const now = new Date(view.generatedAt);
  const { repos, history, policy } = view;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <PageTitle title="Gardener" lead="Is main green in the repos the gardener watches, and is the gardener working?" />
      <ApiBanner api={view.api} />

      <section className="flex flex-col gap-3" aria-labelledby="trees">
        <h2 id="trees" className="text-lg">
          Is the tree open?
        </h2>
        {repos.ok ? (
          repos.list.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {repos.list.map((r) => (
                <TreeCard key={r.name} repo={r} now={now} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">The gardener lists no repo in its status index.</p>
          )
        ) : (
          <Unknown reason={repos.reason} url={repos.url} />
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="alive">
        <h2 id="alive" className="text-lg">
          Is the gardener alive?
        </h2>
        <Card className="grid gap-4 rounded-xl px-4 py-4 shadow-none sm:grid-cols-2">
          <CellView
            title="tree-status workflow"
            cell={{ state: view.writer.state, text: view.writer.reason, url: githubUrl(view.writer.lastRun?.url) ?? view.writer.url, source: view.writer.id }}
            now={now}
          />
          <CellView title="pace (a run about every 5 min)" cell={view.cadence} now={now} />
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="coverage">
        <h2 id="coverage" className="text-lg">
          Are any commits uncovered?
        </h2>
        <p className="text-sm text-muted-foreground">A main commit with no post-submit result is a hole a culprit can hide in.</p>
        {repos.ok ? (
          <div className="grid gap-3 md:grid-cols-2">
            {repos.list.map((r) => (
              <Card key={r.name} className="gap-3 rounded-xl px-4 py-4 shadow-none">
                <h3 className="font-medium wrap-anywhere">{r.name}</h3>
                {r.coverage ? (
                  <>
                    <CellView cell={r.coverage.cell} now={now} />
                    <EntryList label="missing" repo={r.name} entries={r.coverage.missing} />
                    <EntryList label="cancelled" repo={r.name} entries={r.coverage.cancelled} />
                    <EntryList label="backfilling" repo={r.name} entries={r.coverage.backfilling} />
                    <EntryList label="running" repo={r.name} entries={r.coverage.pending} />
                  </>
                ) : (
                  <Unknown reason={r.tree.state === "unknown" ? r.tree.text : "the status file has no coverage"} url={r.statusUrl} />
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Unknown reason={repos.reason} url={repos.url} />
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="broke">
        <h2 id="broke" className="text-lg">
          What broke, and why?
        </h2>
        {repos.ok ? (
          (() => {
            const ranges = repos.list.flatMap((r) => r.red.map((range) => ({ repo: r.name, range })));
            const unread = repos.list.filter((r) => r.tree.state === "unknown" && !r.builders.length);
            return (
              <>
                {ranges.length === 0 && unread.length === 0 ? <p className="text-sm text-muted-foreground">No red range in any repo the gardener watches.</p> : null}
                {unread.map((r) => (
                  <Unknown key={r.name} reason={`${r.name}: ${r.tree.text}`} url={r.statusUrl} />
                ))}
                {ranges.map(({ repo, range }) => (
                  <Card key={`${repo}-${range.builder}-${range.firstBad}`} className="gap-2 rounded-xl px-4 py-4 text-sm shadow-none">
                    <span className="flex flex-wrap items-center gap-2">
                      <StateBadge state="red" />
                      <span className="font-medium wrap-anywhere">{repo}</span>
                      <span className="font-mono text-xs wrap-anywhere text-muted-foreground">{range.builder}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted-foreground">range</span>
                      {range.lastGood ? <Sha sha={range.lastGood} url={web.commit(repo, range.lastGood)} /> : <span className="text-muted-foreground">no green in view</span>}
                      <span aria-hidden="true">..</span>
                      {range.firstBad ? <Sha sha={range.firstBad} url={web.commit(repo, range.firstBad)} /> : null}
                      <a href={range.rangeUrl} className={`text-xs text-muted-foreground ${link}`} target="_blank" rel="noopener noreferrer">
                        compare
                      </a>
                    </span>
                    <ShaList label={range.suspects.length === 1 ? "1 suspect" : `${range.suspects.length} suspects`} repo={repo} shas={range.suspects} />
                    <span className="flex flex-wrap gap-x-3 gap-y-1">
                      <a href={range.runUrl} className={link} target="_blank" rel="noopener noreferrer">
                        first red run
                      </a>
                      {range.backfill ? <span className="text-muted-foreground">first red came from a backfill, so it goes to bisection</span> : null}
                      {range.rerunning ? <span className="text-muted-foreground">its re-run is in progress</span> : null}
                    </span>
                    <span className="text-muted-foreground">Failure type and failed steps: not published yet.</span>
                  </Card>
                ))}
              </>
            );
          })()
        ) : (
          <Unknown reason={repos.reason} url={repos.url} />
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="history">
        <h2 id="history" className="text-lg">
          When did each tree open and close?
        </h2>
        {history.ok ? (
          <>
            <p className="text-sm text-muted-foreground">
              From the last {history.commits} tree-status commits
              {history.since ? (
                <>
                  , back to <time dateTime={history.since} title={exactUtc(history.since)}>{history.since.slice(0, 10)}</time>
                </>
              ) : null}
              {history.full ? "; older changes are not read" : ""}.
            </p>
            {history.events.length ? (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-border bg-card text-sm text-card-foreground">
                {history.events.map((e) => (
                  <li key={`${e.url}-${e.repo}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                    <StateBadge state={e.state === "open" ? "green" : e.state === "closed" ? "red" : "unknown"} />
                    <a href={e.url} className={`wrap-anywhere ${link}`} target="_blank" rel="noopener noreferrer">
                      {e.repo} {e.state}
                    </a>
                    <TimeAgo iso={e.at} now={now} exact className="text-xs text-muted-foreground" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No tree opened or closed in that time.</p>
            )}
          </>
        ) : (
          <Unknown reason={history.reason} url={history.url} />
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="reporting">
        <h2 id="reporting" className="text-lg">
          Why is it only reporting?
        </h2>
        <p className="text-sm text-muted-foreground">A proposed revert waits on the App and the ledger; a revert lands on its own only in a repo listed in auto_land_repos.</p>
        <Card className="grid gap-4 rounded-xl px-4 py-4 shadow-none sm:grid-cols-3">
          {view.readiness.map((item) => (
            <CellView key={item.label} title={item.label} cell={item.cell} now={now} />
          ))}
        </Card>
        <Card className="gap-2 rounded-xl px-4 py-4 text-sm shadow-none">
          <CellView title="revert ledger" cell={view.ledger} now={now} />
          {policy.ok ? (
            <>
              <p>
                Caps: at most {policy.value.dailyCap} reverts created per {policy.value.windowHours} h across all repos. Build breaks: at most {policy.value.build.create} created a day; in a repo listed in auto_land_repos, at
                most {policy.value.build.submit} a day land on their own, and only when the culprit is under {policy.value.build.maxCulpritAgeHours} h old. Test failures: at most {policy.value.test.create} created a day,{" "}
                {policy.value.test.submit === 0 ? "never landed on their own" : `and in a repo listed in auto_land_repos at most ${policy.value.test.submit} a day land on their own`}.
                {policy.value.verification ? " A culprit is verified with and without it first." : ""}
              </p>
              <SourceLink source={`infra-config auto_revert.toml at the gardener's pin ${policy.value.pin.slice(0, 7)}`} url={policy.url} now={now} />
            </>
          ) : (
            <Unknown reason={policy.reason} url={policy.url} />
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="sources">
        <h2 id="sources" className="text-lg">
          Sources
        </h2>
        <SourcesList sources={view.sources} now={now} />
      </section>
    </div>
  );
}

function TreeCard({ repo, now }: { repo: RepoTree; now: Date }) {
  return (
    <Card className="gap-3 rounded-xl px-4 py-4 shadow-none">
      <h3 className="font-medium wrap-anywhere">{repo.name}</h3>
      <CellView cell={repo.tree} now={now} />
      {repo.head || repo.green ? (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {repo.head ? (
            <div className="flex items-center gap-1.5">
              <dt className="text-xs text-muted-foreground">head</dt>
              <dd>
                <Sha sha={repo.head} url={web.commit(repo.name, repo.head)} />
              </dd>
            </div>
          ) : null}
          {repo.green ? (
            <div className="flex items-center gap-1.5">
              <dt className="text-xs text-muted-foreground">newest all green</dt>
              <dd>
                <Sha sha={repo.green} url={web.commit(repo.name, repo.green)} />
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {repo.builders.length ? (
        <ul className="flex flex-col gap-2">
          {repo.builders.map((b) => (
            <li key={b.name}>
              <CellView title={b.name} cell={b.cell} now={now} />
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function ShaList({ label, repo, shas }: { label: string; repo: string; shas: string[] }) {
  if (!shas.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {shas.map((sha) => (
        <Sha key={sha} sha={sha} url={web.commit(repo, sha)} />
      ))}
    </span>
  );
}

function EntryList({ label, repo, entries }: { label: string; repo: string; entries: CoverageEntry[] }) {
  if (!entries.length) return null;
  return (
    <span className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <ul className="flex flex-col gap-1">
        {entries.map((e) => (
          <li key={`${e.sha}-${e.builder}`} className="flex flex-wrap items-center gap-1.5">
            <Sha sha={e.sha} url={web.commit(repo, e.sha)} />
            {e.builder ? <span className="font-mono text-xs wrap-anywhere text-muted-foreground">{e.builder}</span> : null}
          </li>
        ))}
      </ul>
    </span>
  );
}

function Unknown({ reason, url }: { reason: string; url: string }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <StateBadge state="unknown" />
      <a href={url} className={`wrap-anywhere ${link}`} target="_blank" rel="noopener noreferrer">
        {reason}
      </a>
    </p>
  );
}
