"use client";

import { useEffect, useRef, useState } from "react";
import { Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { checkOwners, splitOwners } from "@/lib/editor/codeowners";
import { checkPropertyValue, isEditableType } from "@/lib/editor/properties";
import { checkValue, type FieldValue } from "@/lib/editor/toml-fields";
import type { FieldView, PropertyDefView, RuleView } from "@/lib/editor/types";
import { cn } from "@/lib/utils";

// One row per value. A changed row carries a bar in the pending color and says what it was, with
// an undo; a value the editor cannot change in place is shown as text with a link to its line.

/**
 * A row whose draft is not valid yet tells the page so (the Review button waits). When the row
 * goes away (its card closes) the draft goes with it, so the page must stop waiting for it.
 */
function useClearInvalidOnUnmount(problem: string | undefined, clear: () => void) {
  const latest = useRef({ problem, clear });
  useEffect(() => {
    latest.current = { problem, clear };
  });
  useEffect(() => () => {
    if (latest.current.problem) latest.current.clear();
  }, []);
}

export function fieldText(kind: FieldView["kind"], value: FieldValue | undefined): string {
  if (value === undefined) return "";
  if (kind === "string-list") return (value as string[]).join("\n");
  return String(value);
}

function parseText(kind: NonNullable<FieldView["kind"]>, text: string): unknown {
  if (kind === "integer" || kind === "float") return text.trim() === "" ? Number.NaN : Number(text.trim().replace(/_/g, ""));
  if (kind === "string-list") return text.split("\n").map((s) => s.trim()).filter(Boolean);
  return text;
}

function Row({ changed, children }: { changed: boolean; children: React.ReactNode }) {
  return <div className={cn("flex flex-col gap-1.5 border-b border-line py-3 pl-3", changed ? "border-l-2 border-l-state-pending" : "border-l-2 border-l-transparent")}>{children}</div>;
}

function Notes({ note, help }: { note?: string; help?: string[] }) {
  if (!note && !help?.length) return null;
  return (
    <div className="flex flex-col gap-0.5 text-xs wrap-anywhere text-muted-foreground">
      {help?.map((h, i) => <span key={i}>{h}</span>)}
      {note ? <span>{note}</span> : null}
    </div>
  );
}

function Was({ text, onUndo, label }: { text: string; onUndo: () => void; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="wrap-anywhere">
        was <span className="font-mono">{text}</span>
      </span>
      <Button type="button" variant="ghost" size="sm" className="min-h-11 md:min-h-8" onClick={onUndo} aria-label={`Undo ${label}`}>
        <Undo2 aria-hidden="true" /> Undo
      </Button>
    </div>
  );
}

export function TomlField({
  fileId,
  field,
  value,
  url,
  onChange,
}: {
  fileId: string;
  field: FieldView;
  /** The edited value, when there is one. */
  value: FieldValue | undefined;
  /** The file's GitHub page, for a value edited there; absent when the file is not edited by hand. */
  url?: string;
  onChange: (to: FieldValue | undefined, invalid?: boolean) => void;
}) {
  const id = `${fileId}::${field.id}`;
  const current = value ?? field.value;
  const changed = value !== undefined;
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | undefined>();
  useClearInvalidOnUnmount(problem, () => onChange(undefined, false));

  if (!field.kind) {
    return (
      <Row changed={false}>
        <span className="font-mono text-sm wrap-anywhere">{field.key}</span>
        <span className="font-mono text-xs wrap-anywhere text-muted-foreground">{field.display}</span>
        {url ? (
          <a href={`${url}#L${field.line + 1}`} target="_blank" rel="noopener noreferrer" className="w-fit text-xs underline underline-offset-2">
            Edit this one on GitHub
          </a>
        ) : null}
        <Notes note={field.note} help={field.help} />
      </Row>
    );
  }
  const kind = field.kind;
  const commit = (to: unknown) => {
    const checked = checkValue(kind, to);
    if (!checked.ok) {
      setProblem(checked.reason);
      onChange(undefined, true);
      return;
    }
    setProblem(undefined);
    const same = JSON.stringify(checked.value) === JSON.stringify(field.value);
    onChange(same ? undefined : checked.value);
  };
  const undo = () => {
    setDraft(null);
    setProblem(undefined);
    onChange(undefined);
  };
  const was = <Was text={field.display} onUndo={undo} label={field.key} />;

  if (kind === "boolean") {
    return (
      <Row changed={changed}>
        <div className="flex min-h-11 items-center justify-between gap-3 md:min-h-8">
          <label htmlFor={id} className="font-mono text-sm wrap-anywhere">
            {field.key}
          </label>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <span aria-hidden="true">{current ? "on" : "off"}</span>
            <Switch id={id} checked={current === true} onCheckedChange={(on) => commit(on)} />
          </span>
        </div>
        <Notes note={field.note} help={field.help} />
        {changed ? was : null}
      </Row>
    );
  }
  const text = draft ?? fieldText(kind, current);
  const onText = (next: string) => {
    setDraft(next);
    commit(parseText(kind, next));
  };
  return (
    <Row changed={changed}>
      <label htmlFor={id} className="font-mono text-sm wrap-anywhere">
        {field.key}
        {kind === "string-list" ? <span className="ml-2 font-sans text-xs text-muted-foreground">one per line</span> : null}
      </label>
      {kind === "string-list" ? (
        <Textarea id={id} value={text} onChange={(e) => onText(e.target.value)} aria-invalid={problem ? true : undefined} className="font-mono" rows={Math.min(8, Math.max(2, text.split("\n").length))} />
      ) : (
        <Input
          id={id}
          value={text}
          inputMode={kind === "integer" ? "numeric" : kind === "float" ? "decimal" : undefined}
          onChange={(e) => onText(e.target.value)}
          aria-invalid={problem ? true : undefined}
          className="font-mono"
        />
      )}
      {problem ? <span className="text-xs text-destructive">{problem}</span> : null}
      <Notes note={field.note} help={field.help} />
      {changed ? was : null}
    </Row>
  );
}

export type OwnersDraft = { owners: string[]; removed?: boolean };

export function OwnerRuleRow({
  fileId,
  rule,
  draft,
  onChange,
}: {
  fileId: string;
  rule: RuleView;
  draft: OwnersDraft | undefined;
  onChange: (draft: OwnersDraft | undefined, invalid?: boolean) => void;
}) {
  const id = `${fileId}::${rule.pattern}`;
  const [text, setText] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | undefined>();
  useClearInvalidOnUnmount(problem, () => onChange(undefined, false));
  const owners = draft?.owners ?? rule.owners;
  const changed = draft !== undefined;
  const undo = () => {
    setText(null);
    setProblem(undefined);
    onChange(undefined);
  };
  if (draft?.removed) {
    return (
      <Row changed>
        <span className="font-mono text-sm wrap-anywhere line-through">{rule.pattern}</span>
        <Was text={`${rule.pattern} ${rule.owners.join(" ")}`} onUndo={undo} label={`removing ${rule.pattern}`} />
      </Row>
    );
  }
  return (
    <Row changed={changed}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="font-mono text-sm wrap-anywhere">
          {rule.pattern}
        </label>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 md:min-h-8" onClick={() => onChange({ owners: rule.owners, removed: true })} aria-label={`Remove the rule for ${rule.pattern}`}>
          <X aria-hidden="true" /> Remove
        </Button>
      </div>
      <Input
        id={id}
        value={text ?? owners.join(" ")}
        placeholder="@user @org/team"
        aria-invalid={problem ? true : undefined}
        className="font-mono"
        onChange={(e) => {
          setText(e.target.value);
          const next = splitOwners(e.target.value);
          const bad = checkOwners(next);
          setProblem(bad);
          if (bad) return onChange(undefined, true);
          onChange(next.join(" ") === rule.owners.join(" ") ? undefined : { owners: next });
        }}
      />
      {problem ? <span className="text-xs text-destructive">{problem}</span> : null}
      <Notes help={rule.help} />
      {changed ? <Was text={rule.owners.join(" ") || "(no owner)"} onUndo={undo} label={rule.pattern} /> : null}
    </Row>
  );
}

export function PropertyField({
  repo,
  def,
  saved,
  value,
  onChange,
}: {
  repo: string;
  def: PropertyDefView;
  saved: string | string[] | null;
  value: string | null | undefined;
  onChange: (to: string | null | undefined) => void;
}) {
  const id = `property::${repo}::${def.name}`;
  const changed = value !== undefined;
  if (Array.isArray(saved) || !isEditableType(def.type)) {
    return (
      <Row changed={false}>
        <span className="font-mono text-sm">{def.name}</span>
        <span className="font-mono text-xs wrap-anywhere text-muted-foreground">{Array.isArray(saved) ? saved.join(", ") : (saved ?? "(not set)")}</span>
        <span className="text-xs text-muted-foreground">A {def.type.replace("_", " ")}: change it on GitHub.</span>
      </Row>
    );
  }
  const current = changed ? value : saved;
  const set = (raw: string) => {
    const to = raw === "" ? null : raw;
    onChange(to === saved ? undefined : to);
  };
  const problem = changed ? checkPropertyValue(def, value ?? null) : undefined;
  const options = def.type === "true_false" ? ["true", "false"] : def.allowed;
  return (
    <Row changed={changed}>
      <label htmlFor={id} className="font-mono text-sm">
        {def.name}
      </label>
      {def.type === "single_select" || def.type === "true_false" ? (
        <NativeSelect id={id} value={current ?? ""} onChange={(e) => set(e.target.value)} className="min-w-48 font-mono">
          {!def.required || current === null ? <NativeSelectOption value="">(not set)</NativeSelectOption> : null}
          {options.map((o) => (
            <NativeSelectOption key={o} value={o}>
              {o}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : (
        <Input id={id} value={current ?? ""} maxLength={75} onChange={(e) => set(e.target.value)} aria-invalid={problem ? true : undefined} className="font-mono" />
      )}
      {problem ? <span className="text-xs text-destructive">{problem}</span> : null}
      {def.description ? <Notes note={def.description} /> : null}
      {changed ? <Was text={saved ?? "(not set)"} onUndo={() => onChange(undefined)} label={`${def.name} on ${repo}`} /> : null}
    </Row>
  );
}
