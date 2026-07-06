"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

type ClusterItem = { model: string; count: number; types: string[]; manufacturers: string[] };

const CUSTOM = "__custom__";
const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_RESULTS = 20;

function clusterKey(cluster: ClusterItem[]): string {
  return cluster.map((c) => c.model).join("|||");
}

/**
 * Replaces every merged source item with a single canonical entry, unioning
 * type/manufacturer context and summing counts against any item that was
 * already using the canonical spelling — so the local list reflects a
 * merge/rename immediately without a full page reload.
 */
function mergeItemsInto(
  prev: ClusterItem[],
  sourceItems: ClusterItem[],
  canonical: string,
  movedCount: number
): ClusterItem[] {
  const renamedModels = sourceItems.map((it) => it.model).filter((m) => m !== canonical);
  const remaining = prev.filter((it) => !renamedModels.includes(it.model) && it.model !== canonical);
  const existingCanonical = prev.find((it) => it.model === canonical);

  const types = new Set(existingCanonical?.types ?? []);
  const manufacturers = new Set(existingCanonical?.manufacturers ?? []);
  for (const it of sourceItems) {
    it.types.forEach((x) => types.add(x));
    it.manufacturers.forEach((x) => manufacturers.add(x));
  }

  const mergedItem: ClusterItem = {
    model: canonical,
    count: (existingCanonical?.count ?? 0) + movedCount,
    types: [...types].sort(),
    manufacturers: [...manufacturers].sort(),
  };

  return [...remaining, mergedItem];
}

export function ModelCleanupClient({
  initialClusters,
  initialItems,
}: {
  initialClusters: ClusterItem[][];
  initialItems: ClusterItem[];
}) {
  const t = useTranslations("modelCleanup");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [clusters, setClusters] = useState(initialClusters);
  const [selected, setSelected] = useState<Record<string, string>>(
    Object.fromEntries(initialClusters.map((c) => [clusterKey(c), c[0].model]))
  );
  const [customText, setCustomText] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Record<string, Set<string>>>({});
  const [mergingKey, setMergingKey] = useState<string | null>(null);

  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [renaming, setRenaming] = useState(false);

  function isIncluded(key: string, model: string): boolean {
    return !excluded[key]?.has(model);
  }

  function toggleIncluded(key: string, model: string) {
    setExcluded((prev) => {
      const next = new Set(prev[key] ?? []);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return { ...prev, [key]: next };
    });
  }

  async function handleMerge(cluster: ClusterItem[]) {
    const key = clusterKey(cluster);
    const isCustom = selected[key] === CUSTOM;
    const canonical = (isCustom ? customText[key] : selected[key])?.trim();
    if (!canonical) return;

    const variants = cluster.filter((item) => isIncluded(key, item.model)).map((item) => item.model);
    if (variants.length === 0) return;

    setMergingKey(key);
    const res = await fetch("/api/models/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canonical, variants }),
    });
    setMergingKey(null);
    const data = await res.json();
    if (!res.ok) {
      toast({ title: tCommon("error"), description: data.error, variant: "destructive" });
      return;
    }

    setClusters((prev) => prev.filter((c) => clusterKey(c) !== key));
    setItems((prev) => mergeItemsInto(prev, cluster.filter((it) => variants.includes(it.model)), canonical, data.movedCount));
    toast({
      title: t("mergeButton"),
      description: `${data.movedCount} asset(s) moved to "${canonical}".`,
    });
  }

  function startRename(item: ClusterItem) {
    setRenameTarget(item.model);
    setRenameText(item.model);
  }

  function cancelRename() {
    setRenameTarget(null);
    setRenameText("");
  }

  async function handleRename(item: ClusterItem) {
    const canonical = renameText.trim();
    if (!canonical || canonical === item.model) return;

    setRenaming(true);
    const res = await fetch("/api/models/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canonical, variants: [item.model] }),
    });
    setRenaming(false);
    const data = await res.json();
    if (!res.ok) {
      toast({ title: tCommon("error"), description: data.error, variant: "destructive" });
      return;
    }

    setItems((prev) => mergeItemsInto(prev, [item], canonical, data.movedCount));
    setRenameTarget(null);
    setRenameText("");
    toast({
      title: t("mergeButton"),
      description: `${data.movedCount} asset(s) moved to "${canonical}".`,
    });
  }

  const searchResults =
    search.trim().length >= SEARCH_MIN_LENGTH
      ? items
          .filter((it) => it.model.toLowerCase().includes(search.trim().toLowerCase()))
          .slice(0, SEARCH_MAX_RESULTS)
      : [];

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        {clusters.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{t("noClustersFound")}</div>
        ) : (
          clusters.map((cluster) => {
            const key = clusterKey(cluster);
            const isCustom = selected[key] === CUSTOM;
            const canMerge = isCustom
              ? !!customText[key]?.trim()
              : cluster.some((item) => item.model === selected[key]);
            const hasIncluded = cluster.some((item) => isIncluded(key, item.model));

            return (
              <div key={key} className="border rounded-lg p-4 space-y-3">
                <div className="space-y-2">
                  {cluster.map((item) => (
                    <div key={item.model} className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isIncluded(key, item.model)}
                        onChange={() => toggleIncluded(key, item.model)}
                        aria-label={t("includeInMerge", { model: item.model })}
                        className="h-4 w-4 mt-0.5"
                      />
                      <input
                        type="radio"
                        name={`cluster-${key}`}
                        checked={!isCustom && selected[key] === item.model}
                        onChange={() => setSelected((prev) => ({ ...prev, [key]: item.model }))}
                        aria-label={t("useAsCanonical", { model: item.model })}
                        className="h-4 w-4 mt-0.5"
                      />
                      <div className="flex-1 text-sm">
                        <div className="font-medium">{item.model}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("clusterCount", { count: item.count })}
                          {" · "}
                          {item.types.length > 0 ? item.types.join(", ") : "—"}
                          {" · "}
                          {item.manufacturers.length > 0 ? item.manufacturers.join(", ") : "—"}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Custom canonical spelling */}
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 flex-shrink-0" />
                    <input
                      type="radio"
                      name={`cluster-${key}`}
                      checked={isCustom}
                      onChange={() => setSelected((prev) => ({ ...prev, [key]: CUSTOM }))}
                      aria-label={t("customOption")}
                      className="h-4 w-4"
                    />
                    <Input
                      value={customText[key] ?? ""}
                      onChange={(e) => {
                        setCustomText((prev) => ({ ...prev, [key]: e.target.value }));
                        setSelected((prev) => ({ ...prev, [key]: CUSTOM }));
                      }}
                      placeholder={t("customPlaceholder")}
                      className="max-w-xs h-8 text-sm"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={mergingKey === key || !canMerge || !hasIncluded}
                  onClick={() => handleMerge(cluster)}
                >
                  {mergingKey === key && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("mergeButton")}
                </Button>
              </div>
            );
          })
        )}
      </div>

      <div className="space-y-3 border-t pt-6">
        <div>
          <h2 className="text-sm font-semibold">{t("renameTitle")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t("renameSubtitle")}</p>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="max-w-sm"
        />
        {search.trim().length >= SEARCH_MIN_LENGTH && (
          <div className="border rounded-lg divide-y">
            {searchResults.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                {t("noModelsFound")}
              </div>
            ) : (
              searchResults.map((item) => (
                <div key={item.model} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 text-sm">
                    <div className="font-medium">{item.model}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("clusterCount", { count: item.count })}
                      {" · "}
                      {item.types.length > 0 ? item.types.join(", ") : "—"}
                      {" · "}
                      {item.manufacturers.length > 0 ? item.manufacturers.join(", ") : "—"}
                    </div>
                  </div>
                  {renameTarget === item.model ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        className="h-8 text-sm w-48"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        disabled={renaming || !renameText.trim() || renameText.trim() === item.model}
                        onClick={() => handleRename(item)}
                      >
                        {renaming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t("renameConfirm")}
                      </Button>
                      <Button size="sm" variant="outline" disabled={renaming} onClick={cancelRename}>
                        {tCommon("cancel")}
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => startRename(item)}>
                      {t("renameButton")}
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
