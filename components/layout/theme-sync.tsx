"use client";

import { useEffect } from "react";
import { useTheme, THEME_STORAGE_KEY } from "@/components/layout/theme-provider";
import { parseTheme } from "@/lib/users/preferences";

export function ThemeSync({ serverTheme }: { serverTheme: string }) {
  const { setTheme } = useTheme();

  useEffect(() => {
    // Only sync if the user has no local preference stored yet (new device/browser)
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (!stored) {
      setTheme(parseTheme(serverTheme));
    }
  // Run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
