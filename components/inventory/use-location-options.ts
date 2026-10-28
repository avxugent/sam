"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/use-toast";
import { flattenLocations, type FlatLocation, type LocationTreeNode } from "@/lib/locations/tree";

/**
 * The location tree as flat picker options, (re)loaded each time `enabled`
 * turns true — typically while a dialog is open. A failed load is toasted and
 * leaves the list empty. `toOptions` lets a caller prune or hide entries
 * (e.g. a location's own subtree when moving it).
 */
export function useLocationOptions(
  enabled: boolean,
  toOptions: (tree: LocationTreeNode[]) => FlatLocation[] = (tree) => flattenLocations(tree)
): { locations: FlatLocation[]; loading: boolean } {
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [locations, setLocations] = useState<FlatLocation[]>([]);
  const [loading, setLoading] = useState(false);

  const shape = useEffectEvent(toOptions);
  const reportFailure = useEffectEvent(() => toast({ title: tCommon("loadLocationsFailed"), variant: "destructive" }));

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/locations")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((tree: LocationTreeNode[]) => {
        if (!cancelled) setLocations(shape(tree));
      })
      .catch(() => {
        if (!cancelled) reportFailure();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { locations, loading };
}
