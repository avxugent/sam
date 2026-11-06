"use client";

import { useState, useMemo, Fragment } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { SortableTh } from "@/components/ui/sortable-th";
import { useTableSort } from "@/components/ui/use-row-selection";
import type { AuditAction, AuditEntityType } from "@/lib/audit";
import type { AuditChanges } from "@/lib/audit/diff";

type AuditLog = {
  id: string;
  timestamp: string;
  userId: string | null;
  userEmail: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string | null;
  entityName: string | null;
  detail: string | null;
  ipAddress: string | null;
};

const ACTION_COLORS: Record<AuditAction, string> = {
  CREATE: "bg-success-surface text-success-foreground",
  UPDATE: "bg-info-surface text-info-foreground",
  DELETE: "bg-danger-surface text-destructive",
  IMPORT: "bg-warning-tint text-warning",
  EXPORT: "bg-purple-surface text-purple-foreground",
  LOGIN_SUCCESS: "bg-success-surface text-success-foreground",
  LOGIN_FAILED: "bg-danger-surface text-destructive",
  LOGOUT: "bg-border text-secondary-foreground",
};

const SORT_KEYS = {
  timestamp: (l: AuditLog) => l.timestamp,
  user: (l: AuditLog) => l.userEmail ?? "",
  action: (l: AuditLog) => l.action,
  entity: (l: AuditLog) => `${l.entityType} ${l.entityName ?? ""}`.trim(),
};

function ActionBadge({ action }: { action: AuditAction }) {
  return (
    <span className={cn("inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-[5px]", ACTION_COLORS[action])}>
      {action}
    </span>
  );
}

function DetailRenderer({ detail }: { detail: string }) {
  let parsed: unknown;
  try { parsed = JSON.parse(detail); } catch { return <pre className="text-[11.5px] font-mono text-secondary-foreground whitespace-pre-wrap break-all">{detail}</pre>; }
  if (typeof parsed !== "object" || parsed === null) {
    return <pre className="text-[11.5px] font-mono text-secondary-foreground whitespace-pre-wrap break-all">{JSON.stringify(parsed, null, 2)}</pre>;
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.changes && typeof obj.changes === "object" && obj.changes !== null) {
    const changes = obj.changes as AuditChanges;
    return (
      <table className="text-[12px] border-separate border-spacing-y-[2px]">
        <tbody>
          {Object.entries(changes).map(([field, { from, to }]) => (
            <tr key={field}>
              <td className="pr-4 text-muted-foreground font-medium whitespace-nowrap align-top">{field}</td>
              <td className="pr-2 text-destructive line-through align-top break-all max-w-[220px]">{String(from ?? "—")}</td>
              <td className="pr-2 text-muted-foreground align-top">→</td>
              <td className="text-success-foreground font-medium align-top break-all max-w-[220px]">{String(to ?? "—")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (obj.snapshot && typeof obj.snapshot === "object" && obj.snapshot !== null) {
    const snapshot = obj.snapshot as Record<string, unknown>;
    return (
      <table className="text-[12px] border-separate border-spacing-y-[2px]">
        <tbody>
          {Object.entries(snapshot).map(([field, value]) => (
            <tr key={field}>
              <td className="pr-4 text-muted-foreground font-medium whitespace-nowrap">{field}</td>
              <td className="text-secondary-foreground break-all">{String(value ?? "—")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <pre className="text-[11.5px] font-mono text-secondary-foreground whitespace-pre-wrap break-all">{JSON.stringify(parsed, null, 2)}</pre>;
}

export function AuditLogClient({ initialLogs }: { initialLogs: AuditLog[] }) {
  const t = useTranslations("audit");
  const tCommon = useTranslations("common");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return initialLogs.filter((log) => {
      if (actionFilter && log.action !== actionFilter) return false;
      if (entityFilter && log.entityType !== entityFilter) return false;
      if (!q) return true;
      return (
        log.userEmail?.toLowerCase().includes(q) ||
        log.entityName?.toLowerCase().includes(q) ||
        log.entityType.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.ipAddress?.toLowerCase().includes(q)
      );
    });
  }, [initialLogs, search, actionFilter, entityFilter]);

  const { sortCol, sortDir, handleSort, sorted } = useTableSort(filtered, SORT_KEYS, "timestamp", "desc");

  const actions = [...new Set(initialLogs.map((l) => l.action))].sort();
  const entityTypes = [...new Set(initialLogs.map((l) => l.entityType))].sort();

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`${tCommon("search")}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-[36px] text-[13px] rounded-[8px]"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-[36px] rounded-[8px] border border-input bg-background px-3 text-[13px] text-secondary-foreground"
        >
          <option value="">{t("filterByAction")}</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="h-[36px] rounded-[8px] border border-input bg-background px-3 text-[13px] text-secondary-foreground"
        >
          <option value="">{t("filterByEntity")}</option>
          {entityTypes.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      <p className="text-[12px] text-muted-foreground">{filtered.length} {tCommon("of")} {initialLogs.length}</p>

      <div className="rounded-[10px] border border-border overflow-hidden bg-card">
        <table className="w-full text-[13px]">
          <caption className="sr-only">{t("title")}</caption>
          <thead>
            <tr className="border-b border-border bg-background">
              <SortableTh col="timestamp" label={t("timestamp")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh col="user" label={t("user")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh col="action" label={t("action")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh col="entity" label={t("entity")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-muted-foreground whitespace-nowrap hidden md:table-cell">{t("ip")}</th>
              <th scope="col" className="px-4 py-[10px]"><span className="sr-only">{t("details")}</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-muted-foreground">{t("noLogs")}</td>
              </tr>
            ) : (
              sorted.map((log) => (
                <Fragment key={log.id}>
                  <tr
                    role={log.detail ? "button" : undefined}
                    tabIndex={log.detail ? 0 : undefined}
                    aria-expanded={log.detail ? expandedId === log.id : undefined}
                    aria-label={log.detail ? `${t("showDetails")} ${log.action} ${log.entityType}` : undefined}
                    className="border-b border-border last:border-0 hover:bg-background cursor-pointer focus-visible:outline-none focus-visible:bg-primary-tint"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    onKeyDown={(e) => {
                      if (!log.detail) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedId(expandedId === log.id ? null : log.id);
                      }
                    }}
                  >
                    <td className="px-4 py-[10px] text-[12px] font-mono text-muted-foreground whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString("sv-SE")}
                    </td>
                    <td className="px-4 py-[10px] text-muted-foreground max-w-[160px] truncate">
                      {log.userEmail ?? <span className="italic">system</span>}
                    </td>
                    <td className="px-4 py-[10px]">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-[10px]">
                      <span className="text-muted-foreground">{log.entityType}</span>
                      {log.entityName && (
                        <span className="ml-1 text-foreground font-medium">· {log.entityName}</span>
                      )}
                    </td>
                    <td className="px-4 py-[10px] text-[12px] font-mono text-muted-foreground hidden md:table-cell">
                      {log.ipAddress ?? "—"}
                    </td>
                    <td className="px-4 py-[10px] text-right">
                      {log.detail && (
                        <Button variant="ghost" size="icon" aria-hidden="true" tabIndex={-1} className="h-6 w-6">
                          {expandedId === log.id
                            ? <ChevronUp className="h-3.5 w-3.5" />
                            : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {expandedId === log.id && log.detail && (
                    <tr className="border-b border-border bg-background">
                      <td colSpan={6} className="px-6 py-3">
                        <DetailRenderer detail={log.detail} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
