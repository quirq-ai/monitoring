import { Fragment } from "react";
import Link from "next/link";
import { newTab } from "@/components/new-tab";
import { StateBadge, StateDot, type State } from "@/components/state-badge";
import { byConcern, needsLook, stateCounts } from "@/lib/model/board-view";
import { exactUtc } from "@/lib/model/time";
import type { BoardGroup, BoardRow, Cell } from "@/lib/model/types";
import { cn } from "@/lib/utils";

/**
 * The Board as post-it notes: an overview that indexes every repo by state, then one dotted board
 * per group with a note per repo. A note is tinted by its repo's worst state and pinned with a dot
 * in that color; `unknown` stays plain paper with a dashed edge, so a missing value never looks
 * like a quiet one. Products and repos that need a look are full notes (the fields that need a
 * look first, each non-green state said in words); a green repo is a small note with its name.
 * The shadows, the dark-mode edge strip and the pin glow are in app/globals.css (`.note`).
 */

const tint: Record<State, string> = {
  green: "bg-note-green",
  red: "bg-note-red",
  held: "bg-note-held",
  pending: "bg-note-pending",
  stale: "bg-note-stale",
  unknown: "bg-note-paper outline-dashed outline-[1.5px] outline-offset-[-1.5px] outline-border",
};

const pin: Record<State, string> = {
  green: "bg-state-green",
  red: "bg-state-red",
  held: "bg-state-held",
  pending: "bg-state-pending",
  stale: "bg-state-stale",
  unknown: "border-2 border-state-unknown bg-note-paper",
};

// A slight, fixed tilt per note, so the board reads as paper without moving anything.
const tilts = ["-rotate-[0.8deg]", "rotate-[0.6deg]", "-rotate-[0.4deg]", "rotate-[0.9deg]", "-rotate-[0.6deg]", "rotate-[0.4deg]", "-rotate-[0.9deg]", "rotate-[0.7deg]"];

export type ShownGroup = {
  group: BoardGroup;
  /** The notes on show: every repo, or only the ones that need a look. */
  rows: BoardRow[];
  /** A group too big to share a row with others gets the full width (and two overview columns). */
  wide: boolean;
};

export function noteId(name: string): string {
  return `repo-${name}`;
}

function openPulls(row: BoardRow): string {
  if (row.openPulls < 0) return "?";
  return row.openPullsLowerBound ? `${row.openPulls}+` : String(row.openPulls);
}

/** One count per state, worst first, each with its marker: "2 red · 1 unknown · 4 green". */
function StateTally({ rows, className }: { rows: readonly BoardRow[]; className?: string }) {
  return (
    <p className={cn("flex flex-wrap gap-x-3.5 gap-y-1", className)}>
      {stateCounts(rows).map((c) => (
        <span key={c.state} className="inline-flex items-center gap-1.5 tabular-nums">
          <StateDot state={c.state} />
          {c.count} {c.state}
        </span>
      ))}
    </p>
  );
}

/** Every repo by group as a small tinted chip: the index of the boards below, one tap to a note. */
export function BoardOverview({ shown, total }: { shown: ShownGroup[]; total: readonly BoardRow[] }) {
  return (
    <section id="overview" aria-labelledby="overview-title" className="flex scroll-mt-28 flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5 min-[900px]:scroll-mt-16">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="overview-title" className="text-base">
          Overview <span className="text-sm font-normal text-muted-foreground">{total.length} repos</span>
        </h2>
        <StateTally rows={total} className="text-sm" />
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        {shown.map(({ group, rows, wide }) => (
          <div key={group.id} className={cn("flex min-w-0 flex-col gap-2", wide ? "lg:flex-[2]" : "lg:flex-1")}>
            <h3 className="flex items-baseline justify-between gap-2 text-sm font-medium">
              <a href={`#board-${group.id}`} className="wrap-anywhere underline-offset-2 hover:underline">
                {group.title}
              </a>
              <span className="font-normal tabular-nums text-muted-foreground">{group.repos.length}</span>
            </h3>
            {rows.length ? (
              <ul className={cn("flex flex-wrap gap-1.5 lg:grid", wide ? "lg:grid-cols-2" : "lg:grid-cols-1")}>
                {rows.map((row) => (
                  <li key={row.name} className="min-w-0">
                    <a
                      href={`#${noteId(row.name)}`}
                      aria-label={`${row.name}, ${row.worst}`}
                      className={cn("note-chip flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-sm wrap-anywhere lg:min-h-8 lg:text-[13px]", tint[row.worst])}
                    >
                      <StateDot state={row.worst} />
                      <span className="min-w-0">{row.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing needs a look.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** One group's board: the dotted surface, its title and tally, and a note per repo on show. */
export function Board({ group, rows, wide, apiOk }: ShownGroup & { apiOk: boolean }) {
  const products = group.id === "products";
  const grid = products
    ? "grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3"
    : wide
      ? "grid-cols-3 gap-x-2.5 gap-y-5 sm:grid-cols-4 sm:gap-x-4 lg:grid-cols-6"
      : "grid-cols-3 gap-x-2.5 gap-y-5 sm:grid-cols-4 sm:gap-x-4 lg:grid-cols-2";
  return (
    <section
      id={`board-${group.id}`}
      aria-labelledby={`board-${group.id}-title`}
      className="board-surface flex min-w-0 scroll-mt-28 flex-col gap-4 rounded-2xl border border-line px-3 pt-3.5 pb-5 sm:px-5 sm:pt-4 sm:pb-6 min-[900px]:scroll-mt-16"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id={`board-${group.id}-title`} className="flex items-baseline gap-2 text-base">
          <span className="wrap-anywhere">{group.title}</span>
          <span className="text-sm font-normal tabular-nums text-muted-foreground">{group.repos.length}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          <StateTally rows={group.repos} />
          <a href="#overview" className="inline-flex min-h-11 items-center underline-offset-2 hover:underline md:min-h-0">
            ↑ Overview
          </a>
        </div>
      </div>
      {rows.length ? (
        <ul className={cn("grid list-none items-start", grid)}>
          {rows.map((row, i) => {
            const full = products || needsLook(row, apiOk);
            return <BoardNote key={row.name} row={row} full={full} tilt={tilts[i % tilts.length]} span={full && !products ? "col-span-3 sm:col-span-2" : undefined} />;
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing on this board needs a look.</p>
      )}
    </section>
  );
}

function RepoLink({ row, className }: { row: BoardRow; className: string }) {
  const classes = cn("wrap-anywhere underline-offset-2 hover:underline", className);
  return row.registered ? (
    <Link href={`/repos/${row.name}`} className={classes}>
      {row.name}
    </Link>
  ) : (
    <a href={row.url} className={classes} {...newTab}>
      {row.name}
    </a>
  );
}

function BoardNote({ row, full, tilt, span }: { row: BoardRow; full: boolean; tilt: string; span?: string }) {
  const state = row.worst;
  if (!full) {
    return (
      <li
        id={noteId(row.name)}
        data-note-state={state}
        className={cn(
          "note relative flex min-h-12 min-w-0 scroll-mt-32 flex-col items-center justify-center gap-1 rounded-[2px_2px_8px_2px] px-1.5 pt-3 pb-2 text-center sm:items-start sm:justify-start sm:rounded-[3px_3px_10px_3px] sm:px-3 sm:pt-4 sm:pb-3 sm:text-left min-[900px]:scroll-mt-20",
          tint[state],
          tilt,
        )}
      >
        <span aria-hidden="true" className={cn("note-pin absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full sm:-top-1.5 sm:size-3.5", pin[state])} />
        <RepoLink row={row} className="max-w-full text-[13px] font-medium sm:text-[15px] sm:font-semibold" />
        <span className="sr-only">{state}</span>
        <span className="hidden text-xs text-muted-foreground sm:block">
          {row.ci.text} · {openPulls(row)} {row.openPulls === 1 ? "PR" : "PRs"}
        </span>
      </li>
    );
  }
  const health: { label: string; cell: Cell }[] = [{ label: "CI on main", cell: row.ci }];
  for (const [key, label] of [["tree", "Tree"], ["lkgr", "lkgr"], ["canary", "Canary"], ["deploy", "Deploy"]] as const) {
    const cell = row[key];
    if (cell) health.push({ label, cell });
  }
  return (
    <li
      id={noteId(row.name)}
      data-note-state={state}
      className={cn("note relative flex min-w-0 scroll-mt-32 flex-col gap-2.5 rounded-[3px_3px_10px_3px] px-3.5 pt-4.5 pb-3.5 min-[900px]:scroll-mt-20", tint[state], tilt, span)}
    >
      <span aria-hidden="true" className={cn("note-pin absolute -top-1.5 left-1/2 size-3.5 -translate-x-1/2 rounded-full", pin[state])} />
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <RepoLink row={row} className="text-[15px] font-semibold" />
          {row.description ? <span className="text-xs wrap-anywhere text-muted-foreground">{row.description}</span> : null}
        </span>
        <StateBadge state={state} />
      </div>
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-[13px]">
        {byConcern(health).map((f) => (
          <Fragment key={f.label}>
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd className="min-w-0">
              <CellText cell={f.cell} />
            </dd>
          </Fragment>
        ))}
        <dt className="text-muted-foreground">Open PRs</dt>
        <dd className="min-w-0">
          <a href={`${row.url}/pulls`} className="tabular-nums underline-offset-2 hover:underline" {...newTab}>
            {openPulls(row)}
          </a>
        </dd>
        <dt className="text-muted-foreground">Last merge</dt>
        <dd className="min-w-0">
          <CellText cell={row.lastMerge} />
        </dd>
      </dl>
    </li>
  );
}

/**
 * A field's value. A state other than green is said in words (the badge) before the detail; green
 * is the dot alone with the word for screen readers, so the problems are what the eye lands on. A
 * fact (`none`) is plain muted text.
 */
function CellText({ cell }: { cell: Cell }) {
  const link = (
    <a
      href={cell.url}
      title={cell.at ? exactUtc(cell.at) : undefined}
      className={cn("wrap-anywhere underline-offset-2 hover:underline", cell.state === "none" && "text-muted-foreground")}
      {...(cell.url.startsWith("/") ? {} : newTab)}
    >
      {cell.text}
    </a>
  );
  if (cell.state === "none") return link;
  if (cell.state === "green") {
    return (
      <span className="inline-flex max-w-full items-baseline gap-1.5">
        <StateDot state="green" className="translate-y-[-1px]" />
        <span className="sr-only">green: </span>
        {link}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <StateBadge state={cell.state} />
      {link}
    </span>
  );
}
