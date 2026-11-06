"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Search, X, Loader2, MapPin, Package } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { assetLabel } from "@/lib/assets/label";

/** The parts of GET /api/search the quick results use. */
type QuickSearchResponse = {
  assets: {
    id: string;
    hostname: string | null;
    serialNumber: string | null;
    model?: { name: string } | null;
    type?: { name: string } | null;
    location: { id: string; name: string };
  }[];
  locations: { id: string; name: string; fiNumber: string | null; _count: { assets: number } }[];
};

type QuickResult = {
  id: string;
  kind: "asset" | "location";
  title: string;
  subtitle: string;
  href: string;
};

export function SearchBar() {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const tAsset = useTranslations("asset");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [quickResults, setQuickResults] = useState<QuickResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const fetchQuick = useCallback(async (q: string, signal: AbortSignal) => {
    // Too short to search: also clears a spinner left by an aborted request.
    if (q.length < 2) { setQuickResults([]); setOpen(false); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await apiFetch<QuickSearchResponse>(`/api/search?q=${encodeURIComponent(q)}`, { signal });
      // Aborted because a newer query superseded this one.
      if (signal.aborted) return;
      if (!res.ok) {
        setQuickResults([]);
        setOpen(false);
        return;
      }
      const data = res.data;
      const results: QuickResult[] = [];

      for (const a of data.assets.slice(0, 4)) {
        results.push({
          id: a.id,
          kind: "asset",
          title: assetLabel(a) ?? tAsset("title"),
          subtitle: [a.type?.name, a.location.name].filter(Boolean).join(" · "),
          href: `/locations/${a.location.id}/assets/${a.id}`,
        });
      }
      for (const l of data.locations.slice(0, 3)) {
        results.push({
          id: l.id,
          kind: "location",
          title: l.name,
          subtitle: [l.fiNumber, tAsset("assetCount", { count: l._count.assets })].filter(Boolean).join(" · "),
          href: `/locations/${l.id}`,
        });
      }

      setQuickResults(results);
      setOpen(results.length > 0);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [tAsset]);

  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => fetchQuick(query, controller.signal), 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, fetchQuick]);

  // Reset highlight when results list changes
  useEffect(() => { setActiveIndex(-1); }, [quickResults]);

  function openFullSearch() {
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        if (quickResults.length === 0) return;
        e.preventDefault();
        setOpen(true);
        setActiveIndex((i) => (i + 1) % quickResults.length);
        return;
      case "ArrowUp":
        if (quickResults.length === 0) return;
        e.preventDefault();
        setOpen(true);
        setActiveIndex((i) => (i <= 0 ? quickResults.length - 1 : i - 1));
        return;
      case "Enter":
        if (open && activeIndex >= 0 && quickResults[activeIndex]) {
          e.preventDefault();
          handleSelect(quickResults[activeIndex].href);
        } else if (query.trim().length >= 2) {
          openFullSearch();
        }
        return;
      case "Escape":
        setOpen(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
        return;
    }
  }

  function handleSelect(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  function handleClear() {
    setQuery("");
    setQuickResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  const isExpanded = open && quickResults.length > 0;
  const activeId = isExpanded && activeIndex >= 0 ? `global-search-result-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
        <label htmlFor="global-search" className="sr-only">{t("searchPlaceholder")}</label>
        <input
          ref={inputRef}
          id="global-search"
          type="search"
          role="combobox"
          aria-expanded={isExpanded}
          aria-controls="global-search-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (quickResults.length > 0) setOpen(true); }}
          placeholder={t("searchPlaceholder")}
          className="w-full h-[36px] pl-9 pr-8 text-[13px] bg-background border border-border rounded-[8px] text-foreground placeholder:text-subtle outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--blue-tint)] transition-shadow"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={loading ? `${tc("search")}…` : tc("close")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-secondary-foreground"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {isExpanded && (
        <ul
          id="global-search-listbox"
          role="listbox"
          aria-label={t("searchResults")}
          className="absolute top-full mt-1.5 left-0 right-0 z-50 bg-card border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden list-none m-0 p-0"
        >
          {quickResults.map((r, idx) => (
            <li
              key={r.id + r.kind}
              id={`global-search-result-${idx}`}
              role="option"
              aria-selected={idx === activeIndex}
              className={cn(
                "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                idx === activeIndex ? "bg-primary-tint" : "hover:bg-background"
              )}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(r.href); }}
            >
              <div
                aria-hidden="true"
                className={cn(
                  "w-[34px] h-[34px] rounded-[8px] flex items-center justify-center flex-shrink-0",
                  r.kind === "asset" ? "bg-primary-tint" : "bg-muted"
                )}
              >
                {r.kind === "asset" ? (
                  <Package className="h-4 w-4 text-primary" />
                ) : (
                  <MapPin className="h-4 w-4 fill-primary stroke-primary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-foreground truncate">{r.title}</p>
                {r.subtitle && (
                  <p className="text-[12px] text-muted-foreground truncate">{r.subtitle}</p>
                )}
              </div>
            </li>
          ))}
          <li role="presentation" className="border-t border-border px-3 py-2 bg-background">
            <button
              type="button"
              className="text-xs text-primary hover:underline w-full text-left"
              onMouseDown={(e) => {
                e.preventDefault();
                openFullSearch();
              }}
            >
              {t("seeAllResultsFor", { query })}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
