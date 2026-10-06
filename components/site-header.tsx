import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-8">
      <Link href="/" aria-label="quirq" className="flex items-center">
        {/* White artwork from innernet public/brand/quirq. Light theme recolors it in CSS. */}
        <Image
          src="/brand/quirq/wordmark.svg"
          alt="quirq"
          width={307}
          height={159}
          priority
          unoptimized
          className="brand-wordmark"
        />
      </Link>
      <nav className="ml-auto flex items-center gap-4 text-sm">
        <Link href="/" aria-current="page" className="font-medium text-foreground">
          Today
        </Link>
      </nav>
      <ThemeToggle />
    </header>
  );
}
