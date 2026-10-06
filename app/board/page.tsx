import Link from "next/link";
import { CellInline } from "@/components/cell";
import { PageTitle } from "@/components/page-title";
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
      <PageTitle title="Board" lead="One row per repo: main CI, open PRs, last merge, and for products the tree, lkgr, canary and deploy." />
      {snapshot.unregistered.length ? (
        <p className="rounded-lg border border-border bg-card p-3 text-sm">
          Not in any registry: {snapshot.unregistered.join(", ")}. Add them to infra-config, the gate or this repo&apos;s config/repos.json.
        </p>
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
          <ul className="flex flex-col gap-3 md:hidden">
            {group.repos.map((row) => (
              <li key={row.name} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
                <RepoName row={row} />
                <dl className="grid grid-cols-2 gap-3">
                  <Field label="CI on main">
                    <CellInline cell={row.ci} now={now} />
                  </Field>
                  <Field label="Open PRs">
                    <span className="font-mono text-sm">{openPulls(row)}</span>
                  </Field>
                  <Field label="Last merge" wide>
                    <CellInline cell={row.lastMerge} now={now} />
                  </Field>
                  {group.id === "products"
                    ? productColumns.map((c) =>
                        row[c.key] ? (
                          <Field key={c.key} label={c.label}>
                            <CellInline cell={row[c.key] as Cell} now={now} />
                          </Field>
                        ) : null,
                      )
                    : null}
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
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
  return row.openPulls < 0 ? "?" : String(row.openPulls);
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "col-span-2 flex flex-col gap-1" : "flex flex-col gap-1"}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
