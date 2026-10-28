"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  MapPin,
  Package,
  Search,
  Loader2,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";

type AssetResult = {
  id: string;
  model: { id: string; name: string } | null;
  serialNumber: string | null;
  hostname: string | null;
  type: { id: string; name: string } | null;
  manufacturer: { id: string; name: string } | null;
  location: { id: string; name: string; fiNumber: string | null };
  snippet: string;
  _score: number;
};

type LocationResult = {
  id: string;
  name: string;
  description: string | null;
  fiNumber: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  snippet: string;
  _count: { assets: number; children: number };
};

type SearchResponse = {
  query: string;
  assets: AssetResult[];
  locations: LocationResult[];
  total: number;
  totalAssets: number;
  totalLocations: number;
  page: number;
  assetPages: number;
  locationPages: number;
};

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-100 text-yellow-900 rounded-sm px-0.5 not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      <Highlight text={text.slice(idx + query.length)} query={query} />
    </>
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  const tSearch = useTranslations("search");
  const tCommon = useTranslations("common");
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-[6px] pb-[10px] px-[4px]">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className="flex items-center gap-1 text-[12px] text-primary font-medium disabled:text-subtle disabled:cursor-not-allowed hover:underline"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        {tSearch("previous")}
      </button>
      <span className="text-[12px] text-muted-foreground">
        {tSearch("page")} {page} {tCommon("of")} {totalPages}
      </span>
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        className="flex items-center gap-1 text-[12px] text-primary font-medium disabled:text-subtle disabled:cursor-not-allowed hover:underline"
      >
        {tCommon("next")}
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function SearchResults() {
  const t = useTranslations("search");
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSearch = useCallback(async (query: string, pg: number, signal: AbortSignal) => {
    if (query.length < 2) { setResults(null); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&page=${pg}`, { signal });
      if (!res.ok) throw new Error("Search failed");
      setResults(await res.json());
    } catch {
      // An aborted request was superseded by a newer query or page
      if (signal.aborted) return;
      setError(t("searchFailed"));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    doSearch(q, page, controller.signal);
    return () => controller.abort();
  }, [q, page, doSearch]);

  function goToPage(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`/search?${params.toString()}`);
  }

  if (!q) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
        <Search className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-[18px] font-semibold text-foreground">{t("title")}</p>
        <p className="text-[13px] mt-1">{t("noQuery")}</p>
      </div>
    );
  }

  if (q.length < 2) {
    return (
      <div className="text-center py-16 text-muted-foreground text-[13px]">
        {t("tooShort")}
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Hero search bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted-foreground pointer-events-none" />
        <div className="flex items-center h-[48px] pl-[44px] pr-4 text-[15px] bg-card border-[1.5px] border-primary rounded-[10px] shadow-[0_0_0_3px_var(--blue-tint)] text-foreground">
          <span className="flex-1 truncate">{q}</span>
          {results && (
            <span className="ml-3 text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded flex-shrink-0">
              {t("resultCount", { count: results.total })}
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-[13px]">{t("searching")}</span>
        </div>
      )}

      {error && (
        <div className="text-center py-8 text-destructive text-[13px]">{error}</div>
      )}

      {!loading && results && results.total === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-[15px] font-semibold text-foreground">{t("noResults", { query: q })}</p>
          <p className="text-[13px] mt-1">{t("noResultsHint")}</p>
        </div>
      )}

      {!loading && results && results.total > 0 && (
        <>
          {results.assets.length > 0 && (
            <section>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground mb-[10px]">
                {t("assets")}
                {results.totalAssets > 0 && (
                  <span className="ml-2 font-normal normal-case tracking-normal text-subtle">
                    ({results.totalAssets})
                  </span>
                )}
              </h2>
              <div className="bg-card border border-border rounded-[10px] overflow-hidden mb-[4px]">
                {results.assets.map((asset) => {
                  const displayName = asset.model?.name || asset.hostname || asset.serialNumber || "Unnamed asset";
                  return (
                    <Link
                      key={asset.id}
                      href={`/locations/${asset.location.id}/assets/${asset.id}`}
                      className="flex items-center gap-[14px] px-[18px] py-[13px] hover:bg-background transition-colors border-b border-border last:border-0 group"
                    >
                      <div className="w-[34px] h-[34px] rounded-[8px] bg-primary-tint flex items-center justify-center flex-shrink-0">
                        <Package className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[13.5px] font-semibold text-foreground truncate block">
                          <Highlight text={displayName} query={q} />
                        </span>
                        <span className="text-[12px] text-muted-foreground truncate block">
                          {[asset.type?.name, asset.location.name].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {asset.type && (
                          <span className="text-[11px] font-semibold bg-primary-tint text-primary px-2 py-0.5 rounded-[5px]">
                            <Highlight text={asset.type.name} query={q} />
                          </span>
                        )}
                        {asset.serialNumber && (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            <Highlight text={asset.serialNumber} query={q} />
                          </span>
                        )}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </Link>
                  );
                })}
              </div>
              <Pagination page={results.page} totalPages={results.assetPages} onPage={goToPage} />
            </section>
          )}

          {results.locations.length > 0 && (
            <section>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground mb-[10px]">
                {t("locations")}
                {results.totalLocations > 0 && (
                  <span className="ml-2 font-normal normal-case tracking-normal text-subtle">
                    ({results.totalLocations})
                  </span>
                )}
              </h2>
              <div className="bg-card border border-border rounded-[10px] overflow-hidden mb-[4px]">
                {results.locations.map((location) => (
                  <Link
                    key={location.id}
                    href={`/locations/${location.id}`}
                    className="flex items-center gap-[14px] px-[18px] py-[13px] hover:bg-background transition-colors border-b border-border last:border-0 group"
                  >
                    <div className="w-[34px] h-[34px] rounded-[8px] bg-muted flex items-center justify-center flex-shrink-0">
                      <MapPin className="h-4 w-4 fill-primary stroke-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[13.5px] font-semibold text-foreground truncate block">
                        <Highlight text={location.name} query={q} />
                      </span>
                      <span className="text-[12px] text-muted-foreground truncate block">
                        {[
                          t("assetsFound", { count: location._count.assets }),
                          location._count.children > 0 ? t("locationsFound", { count: location._count.children }) : null,
                          location.city,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {location.fiNumber && (
                        <code className="font-mono text-[11px] text-muted-foreground">
                          <Highlight text={location.fiNumber} query={q} />
                        </code>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
              <Pagination page={results.page} totalPages={results.locationPages} onPage={goToPage} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
