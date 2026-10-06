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

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Pages" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-1 py-2 md:py-0">
        {pages.map((p) => {
          const current = p.href === "/" ? pathname === "/" : pathname.startsWith(p.href);
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-block whitespace-nowrap rounded-md px-3 py-1.5 text-sm underline-offset-4",
                  current ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground hover:underline",
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
