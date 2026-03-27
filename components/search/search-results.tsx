"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  MapPin,
  Package,
  Search,
  Loader2,
  Building2,
  Hash,
} from "lucide-react";

type AssetResult = {
  id: string;
  model: string | null;
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
};

/** Highlights all occurrences of `query` within `text` */
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

export function SearchResults() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";

  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("Search failed");
      setResults(await res.json());
    } catch {
      setError("Search failed. Please try again.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    doSearch(q);
  }, [q, doSearch]);

  if (!q) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
        <Search className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-lg font-medium">Search SAM</p>
        <p className="text-sm mt-1">
          Use the search bar above to find assets and locations.
        </p>
      </div>
    );
  }

  if (q.length < 2) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        Please enter at least 2 characters to search.
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Search results
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {loading
              ? "Searching…"
              : results
              ? `${results.total} result${results.total !== 1 ? "s" : ""} for "${q}"`
              : ""}
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Searching…</span>
        </div>
      )}

      {error && (
        <div className="text-center py-8 text-destructive text-sm">{error}</div>
      )}

      {!loading && results && results.total === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No results found for &quot;{q}&quot;</p>
          <p className="text-sm mt-1">Try different keywords or check the spelling.</p>
        </div>
      )}

      {!loading && results && results.total > 0 && (
        <>
          {/* Asset results */}
          {results.assets.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-3">
                <Package className="h-4 w-4" />
                Assets
                <Badge variant="secondary" className="ml-1">{results.assets.length}</Badge>
              </h2>
              <div className="border rounded-lg divide-y">
                {results.assets.map((asset) => {
                  const displayName =
                    asset.model ||
                    asset.hostname ||
                    asset.serialNumber ||
                    "Unnamed asset";
                  return (
                    <Link
                      key={asset.id}
                      href={`/locations/${asset.location.id}/assets/${asset.id}`}
                      className="flex items-start gap-4 px-4 py-3 hover:bg-muted/40 transition-colors group"
                    >
                      <Package className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm group-hover:text-primary transition-colors">
                            <Highlight text={displayName} query={q} />
                          </span>
                          {asset.type && (
                            <Badge variant="outline" className="text-xs">
                              <Highlight text={asset.type.name} query={q} />
                            </Badge>
                          )}
                          {asset.manufacturer && (
                            <span className="text-xs text-muted-foreground">
                              <Highlight text={asset.manufacturer.name} query={q} />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <Highlight text={asset.location.name} query={q} />
                          {asset.location.fiNumber && (
                            <>
                              <span className="mx-1">·</span>
                              <Hash className="h-3 w-3 flex-shrink-0" />
                              <Highlight text={asset.location.fiNumber} query={q} />
                            </>
                          )}
                        </div>
                        {asset.snippet && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            <Highlight text={asset.snippet} query={q} />
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {results.assets.length > 0 && results.locations.length > 0 && (
            <Separator />
          )}

          {/* Location results */}
          {results.locations.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4" />
                Locations
                <Badge variant="secondary" className="ml-1">{results.locations.length}</Badge>
              </h2>
              <div className="border rounded-lg divide-y">
                {results.locations.map((location) => (
                  <Link
                    key={location.id}
                    href={`/locations/${location.id}`}
                    className="flex items-start gap-4 px-4 py-3 hover:bg-muted/40 transition-colors group"
                  >
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm group-hover:text-primary transition-colors">
                          <Highlight text={location.name} query={q} />
                        </span>
                        {location.fiNumber && (
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                            <Highlight text={location.fiNumber} query={q} />
                          </code>
                        )}
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{location._count.assets} assets</span>
                        <span>{location._count.children} sub-locations</span>
                        {location.city && (
                          <Highlight text={[location.address, location.city, location.country].filter(Boolean).join(", ")} query={q} />
                        )}
                      </div>
                      {location.snippet && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          <Highlight text={location.snippet} query={q} />
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
