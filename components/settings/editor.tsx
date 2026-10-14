"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { ConnectCard } from "@/components/settings/connect";
import { OwnerRuleRow, PropertyField, TomlField, type OwnersDraft } from "@/components/settings/fields";
import { Review } from "@/components/settings/review";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { checkOwners, checkPattern, splitOwners } from "@/lib/editor/codeowners";
import type { FieldValue } from "@/lib/editor/toml-fields";
import type { EditRequest, FieldView, FileView, PropertiesView } from "@/lib/editor/types";

type Mode = "gh" | "script";
type Group = { id: string; title: string; blurb: string };

type TomlEdits = Record<string, Record<string, FieldValue>>;
type OwnerEdits = Record<string, Record<string, OwnersDraft>>;
type NewRules = Record<string, { pattern: string; owners: string[] }[]>;
type PropertyEdits = Record<string, { repo: string; name: string; from: string | null; to: string | null }>;

const KEY_STORE = "settings-editor-key";

/** The tab's key from the link `pnpm editor` printed, kept for this tab only. */
function useEditorKey(mode: Mode): string | undefined {
  const [key, setKey] = useState<string | undefined>();
  useEffect(() => {
    if (mode !== "gh") return;
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("key");
    try {
      if (fromHash) {
        sessionStorage.setItem(KEY_STORE, fromHash);
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      // Reading an external store once on mount; React's own state is the copy the page uses.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setKey(sessionStorage.getItem(KEY_STORE) ?? undefined);
    } catch {
      setKey(fromHash ?? undefined);
    }
  }, [mode]);
  return key;
}

function matches(filter: string, ...texts: (string | undefined)[]): boolean {
  if (!filter) return true;
  const f = filter.toLowerCase();
  return texts.some((t) => t?.toLowerCase().includes(f));
}

export function SettingsEditor({ mode, groups, files, properties, catalogReason }: { mode: Mode; groups: Group[]; files: FileView[]; properties: PropertiesView; catalogReason?: string }) {
  const key = useEditorKey(mode);
  const [toml, setToml] = useState<TomlEdits>({});
  const [owners, setOwners] = useState<OwnerEdits>({});
  const [added, setAdded] = useState<NewRules>({});
  const [props, setProps] = useState<PropertyEdits>({});
  const [invalid, setInvalid] = useState<Record<string, true>>({});
  const [filter, setFilter] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const setInvalidFor = (id: string, bad: boolean) =>
    setInvalid((prev) => {
      if (Boolean(prev[id]) === bad) return prev;
      const next = { ...prev };
      if (bad) next[id] = true;
      else delete next[id];
      return next;
    });

  const fileById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);

  const request: EditRequest = useMemo(() => {
    const out: EditRequest = { files: [], properties: Object.values(props) };
    for (const [id, edits] of Object.entries(toml)) {
      const file = fileById.get(id);
      if (!file?.ok || !file.fields) continue;
      const list = Object.entries(edits).map(([fid, to]) => ({ id: fid, from: file.fields!.find((f) => f.id === fid)?.value, to }));
      if (list.length) out.files.push({ id, toml: list });
    }
    const ownerIds = new Set([...Object.keys(owners), ...Object.keys(added)]);
    for (const id of ownerIds) {
      const file = fileById.get(id);
      if (!file?.ok) continue;
      const list: NonNullable<EditRequest["files"][number]["owners"]> = [];
      for (const [pattern, d] of Object.entries(owners[id] ?? {})) {
        const from = file.rules?.findLast((r) => r.pattern === pattern)?.owners ?? [];
        list.push(d.removed ? { op: "remove", pattern, from } : { op: "set", pattern, from, to: d.owners });
      }
      for (const r of added[id] ?? []) list.push({ op: "add", pattern: r.pattern, to: r.owners });
      if (list.length) out.files.push({ id, owners: list });
    }
    return out;
  }, [toml, owners, added, props, fileById]);

  const count =
    Object.values(toml).reduce((n, e) => n + Object.keys(e).length, 0) +
    Object.values(owners).reduce((n, e) => n + Object.keys(e).length, 0) +
    Object.values(added).reduce((n, e) => n + e.length, 0) +
    Object.keys(props).length;
  const bad = Object.keys(invalid).length;

  const discard = () => {
    setToml({});
    setOwners({});
    setAdded({});
    setProps({});
    setInvalid({});
    setReviewing(false);
  };

  if (reviewing) {
    return <Review mode={mode} editorKey={key} request={request} onBack={() => setReviewing(false)} onDone={discard} />;
  }

  return (
    <div className="flex flex-col gap-8 pb-28">
      <ConnectCard mode={mode} editorKey={key} />
      {catalogReason ? (
        <Alert>
          <AlertTitle>Some repos could not be listed</AlertTitle>
          <AlertDescription className="wrap-anywhere">{catalogReason}. Their CODEOWNERS and manifests are missing below.</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <label htmlFor="settings-filter" className="text-sm font-medium">
          Find a setting
        </label>
        <Input id="settings-filter" type="search" placeholder="auto_merge, xo-space, owners…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>

      {groups.map((g) => {
        // Repos with no CODEOWNERS fold into one line (unless a search or an edit needs them open).
        const inGroup = files.filter((f) => f.group === g.id);
        const absent = inGroup.filter((f) => f.format === "codeowners" && f.ok && !f.exists);
        const fold = !filter && absent.length > 1 && absent.every((f) => !owners[f.id] && !added[f.id]?.length);
        const card = (file: FileView) => (
          <FileCard
            key={file.id}
            file={file}
            filter={filter}
            toml={toml[file.id] ?? {}}
            owners={owners[file.id] ?? {}}
            added={added[file.id] ?? []}
            onToml={(fid, to, isBad) => {
              setInvalidFor(`${file.id}::${fid}`, Boolean(isBad));
              setToml((prev) => {
                const next = { ...(prev[file.id] ?? {}) };
                if (to === undefined) delete next[fid];
                else next[fid] = to;
                return { ...prev, [file.id]: next };
              });
            }}
            onOwners={(pattern, d, isBad) => {
              setInvalidFor(`${file.id}::${pattern}`, Boolean(isBad));
              setOwners((prev) => {
                const next = { ...(prev[file.id] ?? {}) };
                if (d === undefined) delete next[pattern];
                else next[pattern] = d;
                return { ...prev, [file.id]: next };
              });
            }}
            onAdd={(rules) => setAdded((prev) => ({ ...prev, [file.id]: rules }))}
          />
        );
        return (
          <section key={g.id} className="flex flex-col gap-3" aria-labelledby={`group-${g.id}`}>
            <div className="flex flex-col gap-1">
              <h2 id={`group-${g.id}`} className="text-lg">
                {g.title}
              </h2>
              <p className="text-sm text-muted-foreground">{g.blurb}</p>
            </div>
            <div className="flex flex-col gap-3">
              {(fold ? inGroup.filter((f) => !absent.includes(f)) : inGroup).map(card)}
              {fold ? (
                <Card className="gap-0 rounded-xl py-0 shadow-none">
                  <Collapsible>
                    <CollapsibleTrigger className="flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-muted [&[data-state=open]>svg]:rotate-180">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium">{absent.length} repos with no CODEOWNERS yet</span>
                        <span className="text-xs wrap-anywhere text-muted-foreground">{absent.map((f) => f.repo).join(", ")}</span>
                      </span>
                      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="flex flex-col gap-3 px-4 pb-4">{absent.map(card)}</CollapsibleContent>
                  </Collapsible>
                </Card>
              ) : null}
            </div>
          </section>
        );
      })}

      <PropertiesSection properties={properties} filter={filter} edits={props} onChange={setProps} />

      {count > 0 || bad > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-background/95 px-4 py-3 backdrop-blur md:px-8">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
            <span className="text-sm" role="status">
              {count} {count === 1 ? "change" : "changes"}
              {bad ? <span className="text-destructive">, {bad} not valid yet</span> : null}
            </span>
            <span className="flex gap-2">
              <Button type="button" variant="ghost" className="min-h-11" onClick={discard}>
                Discard all
              </Button>
              <Button type="button" className="min-h-11" disabled={count === 0 || bad > 0} onClick={() => setReviewing(true)}>
                Review {count} {count === 1 ? "change" : "changes"}
              </Button>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FileCard({
  file,
  filter,
  toml,
  owners,
  added,
  onToml,
  onOwners,
  onAdd,
}: {
  file: FileView;
  filter: string;
  toml: Record<string, FieldValue>;
  owners: Record<string, OwnersDraft>;
  added: { pattern: string; owners: string[] }[];
  onToml: (fieldId: string, to: FieldValue | undefined, invalid?: boolean) => void;
  onOwners: (pattern: string, draft: OwnersDraft | undefined, invalid?: boolean) => void;
  onAdd: (rules: { pattern: string; owners: string[] }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const changes = Object.keys(toml).length + Object.keys(owners).length + added.length;
  const fields = file.ok ? (file.fields ?? []).filter((f) => matches(filter, f.key, f.section, f.display, f.note, file.title, file.path, file.repo)) : [];
  const rules = file.ok ? (file.rules ?? []).filter((r) => matches(filter, r.pattern, r.owners.join(" "), file.title, file.repo)) : [];
  const shown = file.format === "toml" ? fields.length : rules.length + (matches(filter, file.title, file.repo, "owners", "codeowners") ? 1 : 0);
  if (filter && shown === 0 && changes === 0) return null;
  const sections = groupBySection(fields);

  return (
    <Card className="gap-0 rounded-xl py-0 shadow-none">
      <Collapsible open={open || Boolean(filter)} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-muted [&[data-state=open]>svg]:rotate-180">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium wrap-anywhere">{file.title}</span>
            <span className="font-mono text-xs wrap-anywhere text-muted-foreground">
              {file.repo}/{file.path}
            </span>
          </span>
          {!file.ok ? <span className="text-xs text-muted-foreground">unknown</span> : null}
          {file.ok && !file.exists ? <span className="text-xs text-muted-foreground">none yet</span> : null}
          {changes ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap">
              {changes} {changes === 1 ? "change" : "changes"}
            </span>
          ) : null}
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform" />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 px-4 pb-4">
          {file.readOnly ? <p className="text-sm">{file.readOnly}</p> : null}
          <p className="text-xs text-muted-foreground">
            {file.effect}{" "}
            <a href={file.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              View on GitHub
            </a>
          </p>
          {!file.ok ? (
            <p className="text-sm wrap-anywhere">
              <span className="font-medium">Could not read it:</span> {file.reason}
            </p>
          ) : file.format === "toml" ? (
            sections.map(([section, list]) => (
              <div key={section} className="flex flex-col">
                <h3 className="pt-2 font-mono text-xs font-medium wrap-anywhere text-muted-foreground">{section}</h3>
                {list.map((f) => (
                  <TomlField key={f.id} fileId={file.id} field={f} value={toml[f.id]} url={file.readOnly ? undefined : file.url} onChange={(to, isBad) => onToml(f.id, to, isBad)} />
                ))}
              </div>
            ))
          ) : (
            <div className="flex flex-col">
              {!file.exists ? <p className="text-sm text-muted-foreground">This repo has no .github/CODEOWNERS yet. Adding a rule creates it.</p> : null}
              {rules.map((r) => (
                <OwnerRuleRow key={`${r.line}-${r.pattern}`} fileId={file.id} rule={r} draft={owners[r.pattern]} onChange={(d, isBad) => onOwners(r.pattern, d, isBad)} />
              ))}
              <AddRule existing={(file.rules ?? []).map((r) => r.pattern)} added={added} onChange={onAdd} />
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function groupBySection(fields: FieldView[]): [string, FieldView[]][] {
  const out = new Map<string, FieldView[]>();
  for (const f of fields) out.set(f.section, [...(out.get(f.section) ?? []), f]);
  return [...out.entries()];
}

function AddRule({ existing, added, onChange }: { existing: string[]; added: { pattern: string; owners: string[] }[]; onChange: (rules: { pattern: string; owners: string[] }[]) => void }) {
  const [pattern, setPattern] = useState("");
  const [ownerText, setOwnerText] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const add = () => {
    const list = splitOwners(ownerText);
    const p = pattern.trim();
    const why =
      checkPattern(p) ?? (existing.includes(p) || added.some((a) => a.pattern === p) ? `${p} already has a rule; change its owners above` : undefined) ?? (list.length ? checkOwners(list) : "name at least one owner");
    setProblem(why);
    if (why) return;
    onChange([...added, { pattern: p, owners: list }]);
    setPattern("");
    setOwnerText("");
  };
  return (
    <div className="flex flex-col gap-2 pt-3">
      {added.map((a) => (
        <div key={a.pattern} className="flex items-center justify-between gap-2 border-l-2 border-l-state-pending py-1 pl-3">
          <span className="font-mono text-sm wrap-anywhere">
            {a.pattern} {a.owners.join(" ")} <span className="font-sans text-xs text-muted-foreground">(new)</span>
          </span>
          <Button type="button" variant="ghost" size="sm" className="min-h-11 md:min-h-8" onClick={() => onChange(added.filter((x) => x !== a))}>
            Undo
          </Button>
        </div>
      ))}
      <span className="text-sm font-medium">Add a rule</span>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input aria-label="Path pattern" placeholder="/config/" value={pattern} onChange={(e) => setPattern(e.target.value)} className="font-mono" />
        <Input aria-label="Owners" placeholder="@user @org/team" value={ownerText} onChange={(e) => setOwnerText(e.target.value)} className="font-mono" />
        <Button type="button" variant="outline" className="min-h-11 md:min-h-9" onClick={add}>
          <Plus aria-hidden="true" /> Add
        </Button>
      </div>
      {problem ? <span className="text-xs text-destructive">{problem}</span> : null}
    </div>
  );
}

function PropertiesSection({ properties, filter, edits, onChange }: { properties: PropertiesView; filter: string; edits: PropertyEdits; onChange: (next: PropertyEdits) => void }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="group-properties">
      <div className="flex flex-col gap-1">
        <h2 id="group-properties" className="text-lg">
          Repo properties
        </h2>
        <p className="text-sm text-muted-foreground">
          The org&apos;s custom properties (role, area, owner and the rest). These have no file: a change takes effect on GitHub as soon as you confirm it, with no pull request.
        </p>
      </div>
      {!properties.ok ? (
        <Alert>
          <AlertTitle>Properties could not be read</AlertTitle>
          <AlertDescription className="wrap-anywhere">{properties.reason}</AlertDescription>
        </Alert>
      ) : (
        <Card className="gap-0 rounded-xl py-0 shadow-none">
          <ul className="divide-y divide-line">
            {properties.repos
              .filter((r) => matches(filter, r.repo, ...properties.defs.map((d) => d.name), ...Object.values(r.values).map((v) => (Array.isArray(v) ? v.join(" ") : (v ?? "")))))
              .map((r) => {
                const changed = properties.defs.filter((d) => edits[`${r.repo}\u0000${d.name}`]).length;
                const summary = properties.defs.map((d) => `${d.name} ${valueText(r.values[d.name])}`).join(" · ");
                return (
                  <li key={r.repo}>
                    <Collapsible>
                      <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted [&[data-state=open]>svg]:rotate-180">
                        <span className="w-28 shrink-0 text-sm font-medium wrap-anywhere sm:w-40">{r.repo}</span>
                        <span className="min-w-0 flex-1 font-mono text-xs wrap-anywhere text-muted-foreground">{summary}</span>
                        {changed ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap">{changed} changed</span> : null}
                        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-4 pb-3">
                        {properties.defs.map((d) => {
                          const k = `${r.repo}\u0000${d.name}`;
                          const saved = r.values[d.name] ?? null;
                          return (
                            <PropertyField
                              key={d.name}
                              repo={r.repo}
                              def={d}
                              saved={saved}
                              value={edits[k]?.to}
                              onChange={(to) => {
                                const next = { ...edits };
                                if (to === undefined || Array.isArray(saved)) delete next[k];
                                else next[k] = { repo: r.repo, name: d.name, from: saved, to };
                                onChange(next);
                              }}
                            />
                          );
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  </li>
                );
              })}
          </ul>
          {properties.cut ? <p className="px-4 py-3 text-xs text-muted-foreground">Only the first 100 repos are listed.</p> : null}
        </Card>
      )}
    </section>
  );
}

function valueText(v: string | string[] | null | undefined): string {
  if (v === null || v === undefined) return "–";
  return Array.isArray(v) ? v.join(",") : v;
}
