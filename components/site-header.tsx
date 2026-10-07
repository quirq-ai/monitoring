import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteNav } from "@/components/site-nav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col md:flex-row md:items-center md:gap-8">
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
        <div className="ml-auto hidden md:block">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
