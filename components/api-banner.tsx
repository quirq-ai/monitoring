import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Snapshot } from "@/lib/model/types";

export const apiTitles = {
  ok: "GitHub API answering",
  "no-token": "GitHub token not set",
  "rate-limited": "GitHub rate limit",
  "token-rejected": "GitHub token rejected",
  down: "GitHub API not answering",
} as const;

/** One plain banner when the GitHub API as a whole is unavailable, so cells can just say `unknown`. */
export function ApiBanner({ api }: { api: Snapshot["health"]["api"] }) {
  if (api.state === "ok") return null;
  return (
    <Alert className="rounded-xl border-border bg-muted/60">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{apiTitles[api.state]}</AlertTitle>
      <AlertDescription>
        <span>
          {api.text[0].toUpperCase() + api.text.slice(1)}.{" "}
          <Link href="/health" className="text-foreground underline underline-offset-2">
            Health
          </Link>{" "}
          has every source
          {api.state === "no-token" ? "; the README says how to set the token" : ""}.
        </span>
      </AlertDescription>
    </Alert>
  );
}
