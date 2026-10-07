import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { cookies } from "next/headers";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "quirq monitoring",
  description: "What changed across quirq-ai, and what state everything is in.",
  icons: { icon: "/brand/quirq/app-icon.svg" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const jar = await cookies();
  const stored = jar.get("theme")?.value;
  const theme = stored === "light" || stored === "dark" ? stored : undefined;

  // Geist Sans and Geist Mono ship with the `geist` package and load through next/font/local:
  // self-hosted at build time, no runtime font request. scroll-pt keeps a focused element
  // (Shift+Tab, VoiceOver) out from under the sticky header (WCAG 2.4.11).
  return (
    <html lang="en" data-theme={theme} className={`${GeistSans.variable} ${GeistMono.variable} h-full scroll-pt-28 antialiased md:scroll-pt-16`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex-1 px-4 py-8 md:px-8 md:py-10">{children}</main>
      </body>
    </html>
  );
}
