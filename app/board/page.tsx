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
import type { BoardRow, Cell } from "@/lib/model/types";

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
        <Card className="rounded-lg p-3 text-sm shadow-none">
          Not in any registry: {snapshot.unregistered.join(", ")}. Add them to infra-config, the gate or this repo&apos;s config/repos.json.
        </Card>
      ) : null}
      {snapshot.board.map((group) => (
        <section key={group.id} className="flex flex-col gap-3">
          <h2 className="text-xl text-foreground">{group.title}</h2>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repo</TableHead>
                  <TableHead>CI on main</TableHead>
                  <TableHead>Open PRs</TableHead>
                  <TableHead>Last merge</TableHead>
                  {group.id === "products" ? productColumns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.repos.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="max-w-56 whitespace-normal align-top">
                      <RepoName row={row} />
                    </TableCell>
                    <TableCell className="whitespace-normal align-top">
                      <CellInline cell={row.ci} now={now} />
                    </TableCell>
                    <TableCell className="whitespace-normal align-top font-mono">{openPulls(row)}</TableCell>
                    <TableCell className="min-w-40 whitespace-normal align-top">
                      <CellInline cell={row.lastMerge} now={now} />
                    </TableCell>
                    {group.id === "products"
                      ? productColumns.map((c) => (
                          <TableCell key={c.key} className="min-w-32 whitespace-normal align-top">
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
              the API banner's cause) is one line that opens on tap; anything else is a card. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {group.repos.map((row) =>
              (row.worst === "green" || (row.quiet && snapshot.health.api.state !== "ok")) && group.id !== "products" ? (
                <li key={row.name}>
                  <Collapsible>
                    <Card className="gap-0 rounded-lg py-0 shadow-none">
                      <div className="flex items-center gap-2 px-3">
                        <Link href={`/repos/${row.name}`} className="min-h-11 flex-1 py-2 text-sm font-medium underline-offset-2 hover:underline">
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
                    </Card>
                  </Collapsible>
                </li>
              ) : (
                <li key={row.name}>
                  <Card className="gap-3 rounded-lg px-3 py-3 shadow-none">
                    <RepoName row={row} />
                    <Fields row={row} now={now} product={group.id === "products"} />
                  </Card>
                </li>
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
    <dl className="grid grid-cols-2 gap-3 px-0 pb-3 md:pb-0 [[data-slot=collapsible-content]_&]:px-3 [[data-slot=collapsible-content]_&]:pt-1">
      <Field label="CI on main">
        <CellInline cell={row.ci} now={now} />
      </Field>
      <Field label="Open PRs">
        <span className="font-mono text-sm">{openPulls(row)}</span>
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
        <Link href={`/repos/${row.name}`} className="font-medium underline-offset-2 hover:underline">
          {row.name}
        </Link>
      ) : (
        <a href={row.url} className="font-medium underline-offset-2 hover:underline" rel="noreferrer">
          {row.name}
        </a>
      )}
      {row.description ? <span className="text-xs text-muted-foreground">{row.description}</span> : null}
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
