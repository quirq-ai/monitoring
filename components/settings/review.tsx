"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Download, ExternalLink } from "lucide-react";
import { applyReviewed, reviewEdits } from "@/app/settings/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DiffLine } from "@/lib/editor/diff";
import type { ApplyView, EditRequest, PlanView } from "@/lib/editor/types";
import { cn } from "@/lib/utils";

const SCRIPT_NAME = "settings-change.sh";

// The confirm screen: exactly what each pull request changes, line by line, and every property
// change, before anything is written. A property change has no pull request, so it needs a tick.

export function Review({ mode, editorKey, request, onBack, onDone }: { mode: "gh" | "script"; editorKey: string | undefined; request: EditRequest; onBack: () => void; onDone: () => void }) {
  const [plan, setPlan] = useState<PlanView | undefined>();
  const [confirmed, setConfirmed] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyView | undefined>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    reviewEdits(request).then(
      (p) => live && setPlan(p),
      () => live && setPlan({ ok: false, reason: "the server did not answer; try again" }),
    );
    return () => {
      live = false;
    };
  }, [request]);

  const back = (
    <Button type="button" variant="ghost" className="min-h-11 w-fit" onClick={onBack}>
      <ArrowLeft aria-hidden="true" /> Back to editing
    </Button>
  );

  if (plan === undefined) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <p className="text-sm text-muted-foreground" role="status">
          Reading the files again and building the change…
        </p>
      </div>
    );
  }
  if (!plan.ok) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Alert variant="destructive">
          <AlertTitle>This change cannot be made</AlertTitle>
          <AlertDescription className="wrap-anywhere">{plan.reason}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const prCount = plan.prs.length;
  const propCount = plan.properties.length;
  const needsTick = propCount > 0;
  const apply = async () => {
    setApplying(true);
    try {
      setResult(await applyReviewed(editorKey, request, plan.digest));
    } catch {
      setResult({ ok: false, reason: "the server did not answer; check GitHub before trying again", steps: [] });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {back}
      <div className="flex flex-col gap-1">
        <h2 className="text-lg">Review</h2>
        <p className="text-sm text-muted-foreground">
          {prCount ? `${prCount} pull ${prCount === 1 ? "request" : "requests"}` : "No pull request"}
          {propCount ? `, ${propCount} property ${propCount === 1 ? "change" : "changes"}` : ""}. Nothing has been written yet.
        </p>
      </div>

      {plan.prs.map((pr) => (
        <Card key={pr.repo} className="gap-3 rounded-xl px-4 py-4 shadow-none">
          <span className="text-xs text-muted-foreground">Pull request on {pr.repo}</span>
          <span className="font-medium wrap-anywhere">{pr.title}</span>
          <p className="text-sm">{pr.reviewNote}</p>
          {pr.files.map((f) => (
            <div key={f.id} className="flex flex-col gap-2">
              <span className="font-mono text-sm wrap-anywhere">
                {f.path}
                {f.created ? <span className="ml-2 font-sans text-xs text-muted-foreground">new file</span> : null}
              </span>
              <ul className="list-disc pl-5 text-sm">
                {f.summary.map((s, i) => (
                  <li key={i} className="wrap-anywhere">
                    {s}
                  </li>
                ))}
              </ul>
              <Diff lines={f.diff} label={`Changes to ${pr.repo}/${f.path}`} />
              <p className="text-xs text-muted-foreground">After merge: {f.effect}</p>
            </div>
          ))}
        </Card>
      ))}

      {propCount ? (
        <Card className="gap-3 rounded-xl px-4 py-4 shadow-none">
          <span className="font-medium">Repo properties</span>
          <ul className="flex flex-col gap-1 text-sm">
            {plan.properties.map((p) => (
              <li key={`${p.repo}/${p.name}`} className="wrap-anywhere">
                <span className="font-medium">{p.repo}</span> <span className="font-mono">{p.name}</span>: <span className="font-mono">{p.from ?? "(not set)"}</span> →{" "}
                <span className="font-mono">{p.to ?? "(not set)"}</span>
                {p.needsOrgOwner ? <span className="text-xs text-muted-foreground"> (only an org owner can set this one)</span> : null}
              </li>
            ))}
          </ul>
          <div className="flex items-start gap-3">
            <Checkbox id="confirm-properties" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
            <Label htmlFor="confirm-properties" className="leading-snug font-normal">
              Change {propCount === 1 ? "this property" : `these ${propCount} properties`} on GitHub as soon as I go ahead. There is no pull request to review them.
            </Label>
          </div>
        </Card>
      ) : null}

      {mode === "gh" ? (
        <div className="flex flex-col gap-3">
          {result ? (
            <ApplyResult result={result} onDone={onDone} />
          ) : (
            <Button type="button" className="min-h-11 w-fit" disabled={applying || (needsTick && !confirmed) || editorKey === undefined} onClick={apply}>
              {applying ? "Working…" : prCount ? `Open ${prCount} pull ${prCount === 1 ? "request" : "requests"}${propCount ? " and set the properties" : ""}` : "Set the properties"}
            </Button>
          )}
        </div>
      ) : (
        <Card className="gap-3 rounded-xl px-4 py-4 shadow-none">
          <span className="font-medium">Make the change with your gh login</span>
          <p className="text-sm">
            Save this as <code className="font-mono">{SCRIPT_NAME}</code> and run <code className="font-mono">bash {SCRIPT_NAME}</code>. It checks that each file is still the version this page read and each property still its old value, shows what it will do, asks you
            to type yes, then opens the pull requests{propCount ? " and sets the properties" : ""} as you. Nothing is sent from this page.
          </p>
          {needsTick && !confirmed ? (
            <p className="text-sm text-muted-foreground">Tick the box above to get the script: it changes the properties at once.</p>
          ) : (
            <>
              <Textarea readOnly value={plan.script} aria-label="The gh script" rows={10} className="field-sizing-fixed font-mono text-xs" />
              <span className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    navigator.clipboard.writeText(plan.script).then(
                      () => setCopied(true),
                      () => setCopied(false),
                    );
                  }}
                >
                  <Copy aria-hidden="true" /> {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    const url = URL.createObjectURL(new Blob([plan.script], { type: "text/x-shellscript" }));
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = SCRIPT_NAME;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download aria-hidden="true" /> Download {SCRIPT_NAME}
                </Button>
              </span>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

function Diff({ lines, label }: { lines: DiffLine[]; label: string }) {
  return (
    <div role="region" aria-label={label} className="rounded-md border border-line bg-muted font-mono text-xs">
      {lines.map((l, i) =>
        l.kind === "gap" ? (
          <div key={i} className="px-2 py-0.5 text-muted-foreground">
            …
          </div>
        ) : (
          // A removed line is muted and marked "-", not struck through: a strike over trailing
          // spaces ran past the box on phones.
          <div key={i} className={cn("flex gap-2 px-2 py-0.5", l.kind === "add" && "bg-card", l.kind === "del" && "text-muted-foreground")}>
            <span aria-hidden="true" className="w-8 shrink-0 text-right text-muted-foreground">
              {l.kind === "add" ? l.new : l.old}
            </span>
            <span aria-hidden="true" className="w-3 shrink-0">
              {l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}
            </span>
            {l.kind !== "same" ? <span className="sr-only">{l.kind === "add" ? "added:" : "removed:"}</span> : null}
            <span className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere">{l.text || " "}</span>
          </div>
        ),
      )}
    </div>
  );
}

function ApplyResult({ result, onDone }: { result: ApplyView; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      {result.steps.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {result.steps.map((s) => (
            <li key={s.what} className="wrap-anywhere">
              Done: {s.what}
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 underline underline-offset-2">
                  open <ExternalLink aria-hidden="true" className="size-3" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {result.ok ? (
        <Alert>
          <AlertTitle>Done{result.login ? ` as @${result.login}` : ""}</AlertTitle>
          <AlertDescription>The pull requests now go through their repo&apos;s checks and reviews like any other.</AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertTitle>Stopped</AlertTitle>
          <AlertDescription className="wrap-anywhere">{result.reason}</AlertDescription>
        </Alert>
      )}
      <Button type="button" variant="outline" className="min-h-11 w-fit" onClick={() => (result.ok ? (onDone(), window.location.reload()) : onDone())}>
        {result.ok ? "Start over" : "Discard these edits"}
      </Button>
    </div>
  );
}
