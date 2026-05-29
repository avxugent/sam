"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";

export function AppFooter({ version }: { version: string }) {
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dateStr = now
    ? now.toLocaleDateString(locale, { weekday: "short", year: "numeric", month: "short", day: "numeric" })
    : "";
  const timeStr = now
    ? now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  return (
    <footer className="hidden lg:flex items-center justify-between px-6 py-2 border-t border-[#e2e8f0] bg-[#f8fafc] text-[11px] text-[#94a3b8] shrink-0">
      <span>v{version}</span>
      <span suppressHydrationWarning>
        {dateStr}{dateStr && timeStr ? " · " : ""}{timeStr}
      </span>
    </footer>
  );
}
