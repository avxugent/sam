"use client";

import { useEffect } from "react";
import { useTheme, type Theme } from "@/components/theme-provider";

export function ThemeSync({ serverTheme }: { serverTheme: string }) {
  const { setTheme } = useTheme();

  useEffect(() => {
    // Only sync if the user has no local preference stored yet (new device/browser)
    const stored = localStorage.getItem("sam-theme");
    if (!stored) {
      setTheme((serverTheme as Theme) ?? "light");
    }
  // Run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
