"use client";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

interface ThemeToggleProps {
  className?: string;
  size?: "default" | "sm" | "icon";
  showLabel?: boolean;
}

export function ThemeToggle({ className, size = "icon", showLabel = false }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={toggleTheme}
      className={`relative transition-transform active:scale-95 ${className || ""}`}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400 transition-transform duration-200 rotate-0 hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 text-slate-700 dark:text-slate-200 transition-transform duration-200 hover:-rotate-12" />
      )}
      {showLabel && (
        <span className="ml-2 text-xs font-medium">
          {isDark ? "Light" : "Dark"}
        </span>
      )}
    </Button>
  );
}
