"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const pages = [
  { href: "/", label: "Calendar" },
  { href: "/blockers", label: "Blockers" },
  { href: "/board", label: "Board" },
  { href: "/release", label: "Release" },
  { href: "/gardener", label: "Gardener" },
  { href: "/health", label: "Health" },
] as const;

/**
 * Underlined tabs, centered: the current page carries a bar in the text color, the rest are
 * muted. The row is never a scroll container (a tab row one pixel taller than its box used to
 * scroll on phones); at a large text size the tabs wrap instead. The bar sits on the header's
 * hairline, so the list reaches one pixel into the header's border. Below 460 px the six tabs
 * are compact, and below 400 px they may use most of the header's side gutter, so they keep one
 * row down to about 330 px (tests/e2e/pages.spec.ts scans the phone widths).
 */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Pages" className="-mx-3 -mb-px min-[400px]:mx-0">
      <ul className="flex flex-wrap justify-center min-[460px]:gap-x-1 min-[900px]:gap-x-2">
        {pages.map((p) => {
          const current = p.href === "/" ? pathname === "/" : pathname.startsWith(p.href);
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-[3px] text-[13px] min-[460px]:px-2 min-[460px]:text-sm -outline-offset-2 min-[900px]:min-h-14 min-[900px]:px-3",
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
