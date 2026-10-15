"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The settings editor, as an icon beside the theme toggle rather than a sixth tab: six tabs do not
 * fit one row on a phone, and the second row made the sticky header 44 px taller on every page.
 */
export function SettingsLink() {
  const current = usePathname().startsWith("/settings");
  return (
    <Button asChild variant="ghost" size="icon" className={cn("size-11 min-[900px]:size-9", current ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
      <Link href="/settings" aria-label="Settings" title="Settings" aria-current={current ? "page" : undefined}>
        <Settings aria-hidden="true" />
      </Link>
    </Button>
  );
}
