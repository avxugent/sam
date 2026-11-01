"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import type { AuditAction, AuditEntityType } from "@/lib/audit";
import { AssetStatus } from "@/generated/prisma/enums";
import { HISTORY_CHANGE_LABELS, HISTORY_SNAPSHOT_KEYS } from "@/lib/assets/history-keys";

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  userEmail: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
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
 * snapshot keys and change labels declared in lib/assets/history-keys.ts.
 */
export function historyLabelKey(entry: AuditLogEntry): string {
  const detail = parseDetail(entry.detail);
  const snapshot = (detail?.snapshot ?? {}) as Record<string, unknown>;
  const status = detail?.status;

  if (entry.entityType === "Asset") {
    if (entry.action === "CREATE") {
      return HISTORY_SNAPSHOT_KEYS.deployedFromStock in snapshot ? "deployedFromStock" : "created";
    }
    if (entry.action === "UPDATE") {
      if (status === AssetStatus.DECOMMISSIONED) return "decommissioned";
      if (status === AssetStatus.IN_REPAIR) return "sentForRepair";
      if (status === AssetStatus.INSTALLED) return "reinstated";
      return "edited";
    }
    if (entry.action === "DELETE") {
      return HISTORY_SNAPSHOT_KEYS.returnedToStock in snapshot ? "returnedToStock" : "deleted";
    }
  }

  if (entry.entityType === "StockItem") {
    if (entry.action === "CREATE") {
      return HISTORY_SNAPSHOT_KEYS.returnedFromAssetAt in snapshot ? "returnedToStock" : "addedToStock";
    }
    if (entry.action === "UPDATE") {
      if (HISTORY_SNAPSHOT_KEYS.deployedQuantity in snapshot) return "partiallyDeployed";
      const changes = detail?.changes as Record<string, unknown> | undefined;
      if (changes && HISTORY_CHANGE_LABELS.location in changes) return "relocated";
      return "edited";
    }
    if (entry.action === "DELETE") {
      return HISTORY_SNAPSHOT_KEYS.deployedQuantity in snapshot ? "fullyDeployed" : "deleted";
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
    apiFetch<AuditLogEntry[]>(`/api/assets/${assetId}/history`).then((res) => {
      if (cancelled) return;
      if (res.ok) setEntries(res.data);
      else setError(true);
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
