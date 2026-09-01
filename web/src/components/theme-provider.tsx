"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { applyTheme, getStoredTheme, setStoredTheme, type Theme } from "@/lib/theme";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const initial = getStoredTheme();
    setThemeState(initial);
    applyTheme(initial);

    const matchMedia = window.matchMedia("(prefers-color-scheme: dark)");
    const updateResolved = () => {
      const isDark =
        initial === "dark" || (initial === "system" && matchMedia.matches);
      setResolvedTheme(isDark ? "dark" : "light");
    };
    updateResolved();

    const listener = () => {
      const current = getStoredTheme();
      if (current === "system") {
        applyTheme("system");
        setResolvedTheme(matchMedia.matches ? "dark" : "light");
      }
    };
    matchMedia.addEventListener("change", listener);
    return () => matchMedia.removeEventListener("change", listener);
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    setStoredTheme(next);
    applyTheme(next);
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = next === "dark" || (next === "system" && systemDark);
    setResolvedTheme(isDark ? "dark" : "light");
  };

  const toggleTheme = () => {
    if (resolvedTheme === "dark") {
      setTheme("light");
    } else {
      setTheme("dark");
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
