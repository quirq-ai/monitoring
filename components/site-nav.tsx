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

/**
 * Underlined tabs, centered: the current page carries a bar in the text color, the rest are
 * muted. The row is never a scroll container (a tab row one pixel taller than its box used to
 * scroll on phones); at a large text size the tabs wrap instead. The bar sits on the header's
 * hairline, so the list reaches one pixel into the header's border.
 */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Pages" className="-mb-px">
      <ul className="flex flex-wrap justify-center gap-x-1 md:gap-x-2">
        {pages.map((p) => {
          const current = p.href === "/" ? pathname === "/" : pathname.startsWith(p.href);
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-2 text-sm -outline-offset-2 md:min-h-14 md:px-3",
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
