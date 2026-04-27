"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type AuditLog = {
  id: string;
  timestamp: string | Date;
  userId: string | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  detail: string | null;
  ipAddress: string | null;
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-[#dcfce7] text-[#16a34a]",
  UPDATE: "bg-[#dbeafe] text-[#1d4ed8]",
  DELETE: "bg-[#fee2e2] text-[#dc2626]",
  IMPORT: "bg-[#fef9c3] text-[#ca8a04]",
  EXPORT: "bg-[#f3e8ff] text-[#7c3aed]",
};

function ActionBadge({ action }: { action: string }) {
  return (
    <span className={cn("inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-[5px]", ACTION_COLORS[action] ?? "bg-[#f1f5f9] text-[#64748b]")}>
      {action}
    </span>
  );
}

export function AuditLogClient({ initialLogs }: { initialLogs: AuditLog[] }) {
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

  const actions = [...new Set(initialLogs.map((l) => l.action))].sort();
  const entityTypes = [...new Set(initialLogs.map((l) => l.entityType))].sort();

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by user, entity, IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-[36px] text-[13px] rounded-[8px]"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-[36px] rounded-[8px] border border-input bg-background px-3 text-[13px] text-[#334155]"
        >
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="h-[36px] rounded-[8px] border border-input bg-background px-3 text-[13px] text-[#334155]"
        >
          <option value="">All entity types</option>
          {entityTypes.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      <p className="text-[12px] text-[#64748b]">{filtered.length} of {initialLogs.length} entries</p>

      {/* Table */}
      <div className="rounded-[10px] border border-[#e2e8f0] overflow-hidden bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
              <th className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">Timestamp</th>
              <th className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">User</th>
              <th className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b]">Action</th>
              <th className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b]">Entity</th>
              <th className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] hidden md:table-cell">IP</th>
              <th className="px-4 py-[10px]"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-[#64748b]">No log entries match your filters</td>
              </tr>
            ) : (
              filtered.map((log) => (
                <>
                  <tr
                    key={log.id}
                    className="border-b border-[#e2e8f0] last:border-0 hover:bg-[#f8fafc] cursor-pointer"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <td className="px-4 py-[10px] text-[12px] font-mono text-[#64748b] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-[10px] text-[#64748b] max-w-[160px] truncate">
                      {log.userEmail ?? <span className="italic">system</span>}
                    </td>
                    <td className="px-4 py-[10px]">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-[10px]">
                      <span className="text-[#64748b]">{log.entityType}</span>
                      {log.entityName && (
                        <span className="ml-1 text-[#0f172a] font-medium">· {log.entityName}</span>
                      )}
                    </td>
                    <td className="px-4 py-[10px] text-[12px] font-mono text-[#64748b] hidden md:table-cell">
                      {log.ipAddress ?? "—"}
                    </td>
                    <td className="px-4 py-[10px] text-right">
                      {log.detail && (
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          {expandedId === log.id
                            ? <ChevronUp className="h-3.5 w-3.5" />
                            : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {expandedId === log.id && log.detail && (
                    <tr key={`${log.id}-detail`} className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                      <td colSpan={6} className="px-6 py-3">
                        <pre className="text-[11.5px] font-mono text-[#334155] whitespace-pre-wrap break-all">
                          {JSON.stringify(JSON.parse(log.detail), null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
