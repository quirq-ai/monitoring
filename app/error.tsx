"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StateBadge } from "@/components/state-badge";

/**
 * Shown when a page throws. Next hides a server error's message in production and gives a
 * digest instead, so this says what it can and offers a retry.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <h1 className="text-3xl">This page could not be built</h1>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <StateBadge state="unknown" />
        <span>{error.message || "no message"}</span>
        {error.digest ? <span className="font-mono text-xs text-muted-foreground">digest {error.digest}</span> : null}
      </p>
      <p className="text-sm text-muted-foreground">Nothing was written anywhere; the dashboard only reads. The sources it reads are listed on Health.</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => reset()}>
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/health">Health</Link>
        </Button>
      </div>
    </div>
  );
}
