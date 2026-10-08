import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteNav } from "@/components/site-nav";

/**
 * Sticky header: the wordmark and the theme toggle at the edges, the page tabs centered between
 * them (a three-column grid, so the tabs sit in the middle of the header whatever the edges
 * measure). On a phone the tabs are their own centered row under the wordmark.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-4">
        <div className="flex h-14 items-center gap-3">
          <Link href="/" aria-label="quirq" className="flex items-center">
            {/* White artwork from innernet public/brand/quirq. Light theme recolors it in CSS. */}
            <Image src="/brand/quirq/wordmark.svg" alt="quirq" width={307} height={159} priority unoptimized className="brand-wordmark" />
          </Link>
          <span aria-hidden="true" className="select-none text-xl font-light text-border">
            /
          </span>
          <span className="text-sm font-medium text-muted-foreground">Monitoring</span>
          <div className="ml-auto md:hidden">
            <ThemeToggle />
          </div>
        </div>
        <SiteNav />
        <div className="hidden justify-self-end md:block">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
