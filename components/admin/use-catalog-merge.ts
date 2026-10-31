"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MergeResult } from "@/lib/catalog/merge";
import { apiFetch, jsonBody } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

/**
 * POSTs a catalog merge (`/api/<resource>/<sourceId>/merge`) and toasts the
 * API error on failure. Resolves to the merge counts, or null when it failed.
 */
export function useCatalogMerge(resource: "asset-types" | "manufacturers" | "models") {
  const tCommon = useTranslations("common");
  const showApiError = useApiErrorToast();
  const [merging, setMerging] = useState(false);

  async function merge(sourceId: string, targetId: string): Promise<MergeResult | null> {
    setMerging(true);
    const res = await apiFetch<MergeResult>(`/api/${resource}/${sourceId}/merge`, jsonBody("POST", { targetId }));
    setMerging(false);
    if (!res.ok) {
      showApiError(res.error);
      return null;
    }
    return res.data;
  }

  /** "3 assets and 1 stock item moved." */
  function summary(result: MergeResult): string {
    return tCommon("mergeSummary", { assets: result.assetsMoved, stock: result.stockItemsMoved ?? 0 });
  }

  return { merging, merge, summary };
}
