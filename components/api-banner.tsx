import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Snapshot } from "@/lib/model/types";

const titles = {
  "no-token": "GitHub token not set",
  "rate-limited": "GitHub rate limit",
  "token-rejected": "GitHub token rejected",
  down: "GitHub API not answering",
} as const;

/** One plain banner when the GitHub API as a whole is unavailable, so cells can just say `unknown`. */
export function ApiBanner({ api }: { api: Snapshot["health"]["api"] }) {
  if (api.state === "ok") return null;
  return (
    <Alert>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{titles[api.state]}</AlertTitle>
      <AlertDescription>
        <span>
          {api.text}.{" "}
          <Link href="/health" className="underline underline-offset-2">
            Health
          </Link>{" "}
          has the details
          {api.state === "no-token" ? " and the README says how to set the token" : ""}.
        </span>
      </AlertDescription>
    </Alert>
  );
}
