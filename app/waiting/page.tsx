import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { StateBadge } from "@/components/state-badge";
import { TimeAgo } from "@/components/time-ago";
import { buildSnapshot } from "@/lib/model/build";

const kindWords: Record<string, string> = {
  review: "review requested",
  assigned: "assigned to you",
  "stale-approval": "approval on an older head",
  held: "canary held",
  failure: "open failure",
};

export default async function WaitingPage() {
  const snapshot = await buildSnapshot();
  const now = new Date(snapshot.generatedAt);
  const down = snapshot.sources.filter((s) => !s.ok && /^github\/(pulls|issues|reviews)/.test(s.source));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageTitle title="Waiting on you" lead={`PRs that need ${snapshot.owner}, held canaries and open failures.`} />
      {down.length ? (
        <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          {down.length} of the PR and issue sources could not be read, so this list may be short: {down[0].reason}.
        </p>
      ) : null}
      {snapshot.waiting.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Nothing is waiting on you.</p>
      ) : (
        <ol className="divide-y divide-border rounded-lg border border-border bg-card">
          {snapshot.waiting.map((item, i) => (
            <li key={`${item.kind}-${item.url}-${i}`} className="flex flex-col gap-1 px-3 py-3">
              <span className="flex flex-wrap items-center gap-2">
                <StateBadge state={item.state} />
                <span className="text-xs text-muted-foreground">{kindWords[item.kind]}</span>
                <Link href={`/repos/${item.repo}`} className="text-sm font-medium underline-offset-2 hover:underline">
                  {item.repo}
                </Link>
              </span>
              <a href={item.url} className="text-base underline-offset-2 hover:underline" rel="noreferrer">
                {item.title}
              </a>
              <span className="text-sm text-muted-foreground">
                {item.detail}
                {" · "}
                <TimeAgo iso={item.since} now={now} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
