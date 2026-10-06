import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteNav } from "@/components/site-nav";

export function SiteHeader() {
  return (
    <header className="flex flex-col border-b border-border px-4 pt-3 md:flex-row md:items-center md:gap-6 md:px-8 md:py-3">
      <div className="flex items-center">
        <Link href="/" aria-label="quirq" className="flex items-center">
          {/* White artwork from innernet public/brand/quirq. Light theme recolors it in CSS. */}
          <Image src="/brand/quirq/wordmark.svg" alt="quirq" width={307} height={159} priority unoptimized className="brand-wordmark" />
        </Link>
        <span className="ml-2 text-sm text-muted-foreground">monitoring</span>
        <div className="ml-auto md:hidden">
          <ThemeToggle />
        </div>
      </div>
      <SiteNav />
      <div className="ml-auto hidden md:block">
        <ThemeToggle />
      </div>
    </header>
  );
}
