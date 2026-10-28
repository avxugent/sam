"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  userEmail: string | null;
  action: string;
  entityType: string;
  detail: string | null;
};

function parseDetail(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Maps an AuditLog row to a `history.*` translation key. Asset/StockItem
 * writes share the generic CREATE/UPDATE/DELETE actions, so the specific
 * event (e.g. deploy vs. manual create) is disambiguated by sniffing the
 * `detail` JSON keys each lifecycle route already writes — see
 * lib/assets/lifecycle-rules.ts and the various asset/stock API routes.
 */
export function historyLabelKey(entry: AuditLogEntry): string {
  const detail = parseDetail(entry.detail);
  const snapshot = (detail?.snapshot ?? {}) as Record<string, unknown>;
  const status = detail?.status;

  if (entry.entityType === "Asset") {
    if (entry.action === "CREATE") {
      return "Deployed from stock" in snapshot ? "deployedFromStock" : "created";
    }
    if (entry.action === "UPDATE") {
      if (status === "DECOMMISSIONED") return "decommissioned";
      if (status === "IN_REPAIR") return "sentForRepair";
      if (status === "INSTALLED") return "reinstated";
      return "edited";
    }
    if (entry.action === "DELETE") {
      return "Returned to stock" in snapshot ? "returnedToStock" : "deleted";
    }
  }

  if (entry.entityType === "StockItem") {
    if (entry.action === "CREATE") {
      return "Returned from asset at" in snapshot ? "returnedToStock" : "addedToStock";
    }
    if (entry.action === "UPDATE") {
      if ("Deployed quantity" in snapshot) return "partiallyDeployed";
      const changes = detail?.changes as Record<string, unknown> | undefined;
      if (changes && "Location" in changes) return "relocated";
      return "edited";
    }
    if (entry.action === "DELETE") {
      return "Deployed quantity" in snapshot ? "fullyDeployed" : "deleted";
    }
  }

  return "edited";
}

export function AssetHistoryTimeline({ assetId }: { assetId: string }) {
  const t = useTranslations("history");
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/assets/${assetId}/history`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load history");
        return res.json() as Promise<AuditLogEntry[]>;
      })
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  if (error) {
    return <p className="text-[12.5px] text-subtle">{t("error")}</p>;
  }
  if (entries === null) {
    return <p className="text-[12.5px] text-subtle">{t("loading")}</p>;
  }
  if (entries.length === 0) {
    return <p className="text-[12.5px] text-subtle">{t("empty")}</p>;
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="border-l-2 border-border pl-3">
          <p className="text-[12.5px] font-medium text-foreground">{t(historyLabelKey(entry))}</p>
          <p className="text-[11px] text-subtle">
            {new Date(entry.timestamp).toLocaleString("sv-SE")}
            {entry.userEmail && ` · ${t("byUser", { email: entry.userEmail })}`}
          </p>
        </li>
      ))}
    </ul>
  );
}
