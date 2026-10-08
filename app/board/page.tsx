import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ApiBanner } from "@/components/api-banner";
import { CellInline } from "@/components/cell";
import { PageTitle } from "@/components/page-title";
import { StateBadge } from "@/components/state-badge";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildSnapshot } from "@/lib/model/build";
import { foldRuns } from "@/lib/model/fold-runs";
import type { BoardRow, Cell } from "@/lib/model/types";

const headClass = "h-10 px-3 text-xs font-medium text-muted-foreground";

const productColumns: { key: "tree" | "lkgr" | "canary" | "deploy"; label: string }[] = [
  { key: "tree", label: "Tree" },
  { key: "lkgr", label: "lkgr" },
  { key: "canary", label: "Canary" },
  { key: "deploy", label: "Deploy" },
];

export default async function BoardPage() {
  const snapshot = await buildSnapshot();
  const now = new Date(snapshot.generatedAt);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <PageTitle title="Board" lead="One row per repo, the ones that need a look first: main CI, open PRs, last merge, and for products the tree, lkgr, canary and deploy." />
      <ApiBanner api={snapshot.health.api} />
      {snapshot.unregistered.length ? (
        <Card className="rounded-xl p-4 text-sm wrap-anywhere shadow-none">
          Not in any registry: {snapshot.unregistered.join(", ")}. Add them to infra-config, the gate or this repo&apos;s config/repos.json.
        </Card>
      ) : null}
      {snapshot.board.map((group) => (
        <section key={group.id} className="flex flex-col gap-3">
          <h2 className="text-lg">{group.title}</h2>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card text-card-foreground md:block">
            <Table>
              <TableHeader className="bg-muted/50 [&_tr]:border-line">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={headClass}>Repo</TableHead>
                  <TableHead className={headClass}>CI on main</TableHead>
                  <TableHead className={headClass}>Open PRs</TableHead>
                  <TableHead className={headClass}>Last merge</TableHead>
                  {group.id === "products"
                    ? productColumns.map((c) => (
                        <TableHead key={c.key} className={headClass}>
                          {c.label}
                        </TableHead>
                      ))
                    : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.repos.map((row) => (
                  <TableRow key={row.name} className="border-line">
                    <TableCell className="max-w-56 whitespace-normal px-3 py-3 align-top">
                      <RepoName row={row} />
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3 align-top">
                      <CellInline cell={row.ci} now={now} />
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-3 align-top tabular-nums">{openPulls(row)}</TableCell>
                    <TableCell className="min-w-40 whitespace-normal px-3 py-3 align-top">
                      <CellInline cell={row.lastMerge} now={now} />
                    </TableCell>
                    {group.id === "products"
                      ? productColumns.map((c) => (
                          <TableCell key={c.key} className="min-w-32 whitespace-normal px-3 py-3 align-top">
                            {row[c.key] ? <CellInline cell={row[c.key] as Cell} now={now} /> : null}
                          </TableCell>
                        ))
                      : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* On a phone, a non-product repo with nothing to look at (green, or unknown only because
              the API banner's cause) is one line that opens on tap, and a run of such lines shares
              one card; anything else is a card of its own. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {foldRuns(group.repos, (row) => (row.worst === "green" || (row.quiet && snapshot.health.api.state !== "ok")) && group.id !== "products").map((run) =>
              run.folded ? (
                <li key={`run:${run.items[0].name}`}>
                  <Card className="gap-0 overflow-hidden rounded-xl py-0 shadow-none">
                    <ul className="divide-y divide-line">
                      {run.items.map((row) => (
                        <li key={row.name}>
                          <Collapsible>
                            <div className="flex min-h-11 items-center gap-2 px-4">
                              <Link href={`/repos/${row.name}`} className="min-h-11 min-w-0 flex-1 py-2 text-sm font-medium wrap-anywhere underline-offset-2 hover:underline">
                                <span className="flex min-h-7 items-center">{row.name}</span>
                              </Link>
                              <StateBadge state={row.worst} />
                              <CollapsibleTrigger className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted [&[data-state=open]>svg]:rotate-180" aria-label={`Details for ${row.name}`}>
                                <ChevronDown className="size-5 transition-transform" aria-hidden="true" />
                              </CollapsibleTrigger>
                            </div>
                            <CollapsibleContent>
                              <Fields row={row} now={now} product={false} />
                            </CollapsibleContent>
                          </Collapsible>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </li>
              ) : (
                run.items.map((row) => (
                  <li key={row.name}>
                    <Card className="gap-3 rounded-xl px-4 py-3 shadow-none">
                      <RepoName row={row} />
                      <Fields row={row} now={now} product={group.id === "products"} />
                    </Card>
                  </li>
                ))
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Fields({ row, now, product }: { row: BoardRow; now: Date; product: boolean }) {
  return (
    <dl className="grid grid-cols-2 gap-3 px-0 pb-3 md:pb-0 [[data-slot=collapsible-content]_&]:px-4 [[data-slot=collapsible-content]_&]:pt-1">
      <Field label="CI on main">
        <CellInline cell={row.ci} now={now} />
      </Field>
      <Field label="Open PRs">
        <span className="text-sm tabular-nums">{openPulls(row)}</span>
      </Field>
      <Field label="Last merge" wide>
        <CellInline cell={row.lastMerge} now={now} />
      </Field>
      {product
        ? productColumns.map((c) =>
            row[c.key] ? (
              <Field key={c.key} label={c.label}>
                <CellInline cell={row[c.key] as Cell} now={now} />
              </Field>
            ) : null,
          )
        : null}
    </dl>
  );
}

function RepoName({ row }: { row: BoardRow }) {
  return (
    <span className="flex flex-col">
      {row.registered ? (
        <Link href={`/repos/${row.name}`} className="font-medium wrap-anywhere underline-offset-2 hover:underline">
          {row.name}
        </Link>
      ) : (
        <a href={row.url} className="font-medium wrap-anywhere underline-offset-2 hover:underline" rel="noreferrer">
          {row.name}
        </a>
      )}
      {row.description ? <span className="text-xs wrap-anywhere text-muted-foreground">{row.description}</span> : null}
    </span>
  );
}

function openPulls(row: BoardRow): string {
  if (row.openPulls < 0) return "?";
  return row.openPullsLowerBound ? `${row.openPulls}+` : String(row.openPulls);
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "col-span-2 flex flex-col gap-1" : "flex flex-col gap-1"}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
