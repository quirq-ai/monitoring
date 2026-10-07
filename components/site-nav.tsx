"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const pages = [
  { href: "/", label: "Today" },
  { href: "/waiting", label: "Waiting" },
  { href: "/board", label: "Board" },
  { href: "/release", label: "Release" },
  { href: "/health", label: "Health" },
] as const;

/** Underlined tabs: the current page carries a bar in the text color, the rest are muted. */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Pages" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="-mb-px flex gap-1 md:gap-2">
        {pages.map((p) => {
          const current = p.href === "/" ? pathname === "/" : pathname.startsWith(p.href);
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-2 text-sm md:min-h-14",
                  current ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
