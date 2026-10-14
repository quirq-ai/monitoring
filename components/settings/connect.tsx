"use client";

import { useEffect, useState } from "react";
import { Github } from "lucide-react";
import { whoAmI } from "@/app/settings/actions";
import { Card } from "@/components/ui/card";

// How this editor reaches GitHub. Locally (pnpm editor) it is the person's own gh login, and the
// card says who that is. On the deployed site nobody signs in and no token is kept: the review
// screen hands over a gh script instead.

export function ConnectCard({ mode, editorKey }: { mode: "gh" | "script"; editorKey: string | undefined }) {
  const [who, setWho] = useState<{ ok: true; login: string } | { ok: false; reason: string } | undefined>();
  useEffect(() => {
    if (mode !== "gh" || editorKey === undefined) return;
    let live = true;
    whoAmI(editorKey).then((r) => {
      if (live) setWho(r);
    });
    return () => {
      live = false;
    };
  }, [mode, editorKey]);

  if (mode === "gh") {
    return (
      <Card className="gap-2 rounded-xl px-4 py-4 shadow-none" data-testid="connect">
        <span className="flex items-center gap-2 font-medium">
          <Github aria-hidden="true" className="size-4" /> GitHub
        </span>
        {who === undefined ? (
          <span className="text-sm text-muted-foreground">{editorKey === undefined ? "Open the link pnpm editor printed in your terminal: this tab does not have its key." : "Checking your gh login…"}</span>
        ) : who.ok ? (
          <span className="text-sm">
            Connected as <span className="font-mono">@{who.login}</span> through gh on this machine. Pull requests open as you; nothing is stored.
          </span>
        ) : (
          <span className="text-sm wrap-anywhere">
            <span className="font-medium">Not connected:</span> {who.reason}
          </span>
        )}
      </Card>
    );
  }
  return (
    <Card className="gap-2 rounded-xl px-4 py-4 shadow-none" data-testid="connect">
      <span className="flex items-center gap-2 font-medium">
        <Github aria-hidden="true" className="size-4" /> Connect GitHub
      </span>
      <p className="text-sm">
        Changes are made with your own GitHub login through{" "}
        <a href="https://cli.github.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          gh
        </a>
        , never with this site&apos;s token. Edit here, review, then either run the gh script the review gives you, or run{" "}
        <code className="rounded bg-muted px-1 font-mono text-xs">pnpm editor</code> in a monitoring checkout to open the pull requests straight from this page.
      </p>
      <p className="text-xs text-muted-foreground">Signing in with GitHub on this site needs a GitHub OAuth App registered by the org owner; it is not set up yet.</p>
    </Card>
  );
}
