"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const oneYear = 60 * 60 * 24 * 365;

export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const explicit = root.dataset.theme;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const current =
      explicit === "light" || explicit === "dark"
        ? explicit
        : systemDark
          ? "dark"
          : "light";
    const next = current === "dark" ? "light" : "dark";
    document.cookie = `theme=${next}; Path=/; Max-Age=${oneYear}; SameSite=Lax`;
    root.dataset.theme = next;
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label="Toggle color theme"
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
