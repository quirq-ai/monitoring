import { ExternalLink } from "lucide-react";
import { TimeAgo } from "@/components/time-ago";

/** "from release/channels, 4 min ago": where a value came from and how old the data says it is. */
export function SourceLink({ source, url, at, now, label = "from" }: { source: string; url: string; at?: string; now: Date; label?: string }) {
  return (
    <a href={url} className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline" rel="noreferrer">
      <span>
        {label} {source}
        {at ? ", " : ""}
      </span>
      {at ? <TimeAgo iso={at} now={now} /> : null}
      <ExternalLink aria-hidden="true" className="size-3" />
    </a>
  );
}
