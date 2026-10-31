"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, Wrench, Package } from "lucide-react";
import { WorkLogFormDialog, type WorkLogAssetOption, type WorkLogUserOption, type WorkLogItemOption } from "@/components/locations/work-log-form-dialog";
import { JiraIssueBadge } from "@/components/locations/jira-issue-badge";
import { useTranslations } from "next-intl";
import { formatDate, getInitials, apiErrorMessage } from "@/lib/utils";
import * as permissions from "@/lib/permissions";
import type { Role } from "@/lib/permissions";
import { apiFetch } from "@/lib/api-client";

export type WorkLogEntry = {
  id: string;
  performedAt: string;
  description: string;
  jiraIssueKey: string | null;
  performedBy: { id: string; name: string; email: string };
  item: { id: string; name: string } | null;
  asset: {
    id: string;
    model: { name: string } | null;
    serialNumber: string | null;
    hostname: string | null;
    type: { id: string; name: string } | null;
  } | null;
};

type Props = {
  locationId: string;
  entries: WorkLogEntry[];
  assets: WorkLogAssetOption[];
  users: WorkLogUserOption[];
  items: WorkLogItemOption[];
  currentUserId: string;
  userRole: Role;
  jiraBaseUrl: string | null;
};

function assetLabel(asset: WorkLogEntry["asset"]): string {
  if (!asset) return "";
  return asset.model?.name || asset.hostname || asset.serialNumber || "Asset";
}

export function WorkLogList({
  locationId,
  entries: initialEntries,
  assets,
  users,
  items,
  currentUserId,
  userRole,
  jiraBaseUrl,
}: Props) {
  const t = useTranslations("workLog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();
  const [entries, setEntries] = useState<WorkLogEntry[]>(initialEntries);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Sync local state when the parent re-fetches (e.g. after router.refresh()
  // from the form dialog). Without this, useState's initializer runs only
  // once and new entries don't appear until a manual page reload.
  useEffect(() => { setEntries(initialEntries); }, [initialEntries]);

  const canCreate = permissions.canEdit(userRole);
  const isAdmin = permissions.isAdmin(userRole);

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.description.toLowerCase().includes(q) ||
      e.performedBy.name?.toLowerCase().includes(q) ||
      e.jiraIssueKey?.toLowerCase().includes(q) ||
      e.item?.name.toLowerCase().includes(q) ||
      assetLabel(e.asset).toLowerCase().includes(q)
    );
  });

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/work-logs/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast({ title: tCommon("error"), description: apiErrorMessage(res.error, tCommon("somethingWentWrong")), variant: "destructive" });
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    toast({ title: t("entryDeleted") });
    router.refresh();
  }

  function canModify(entry: WorkLogEntry): boolean {
    return isAdmin || entry.performedBy.id === currentUserId;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label={t("searchPlaceholder")}
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-[36px] text-[13px] rounded-[8px]"
          />
        </div>
        {canCreate && (
          <WorkLogFormDialog
            mode="create"
            locationId={locationId}
            assets={assets}
            users={users}
            items={items}
            currentUserId={currentUserId}
          >
            <Button size="sm" className="h-[36px] gap-1.5 bg-brand-yellow text-[#0f172a] font-bold hover:brightness-95 text-[13px]">
              <Plus className="h-4 w-4" />
              {t("addEntry")}
            </Button>
          </WorkLogFormDialog>
        )}
      </div>

      {/* Empty state */}
      {entries.length === 0 ? (
        <div className="text-center py-12 border border-border rounded-[10px] bg-card">
          <Wrench className="h-10 w-10 mx-auto mb-3 text-subtle opacity-60" />
          <p className="text-[14px] text-muted-foreground mb-1">{t("noEntries")}</p>
          <p className="text-[12px] text-subtle">
            {canCreate ? t("noEntriesHint") : t("noEntriesViewerHint")}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 border border-border rounded-[10px] bg-card">
          <p className="text-[13px] text-muted-foreground">{t("noSearchResults")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => {
            const initials = getInitials(entry.performedBy.name, entry.performedBy.email);
            const assetText = assetLabel(entry.asset);
            return (
              <div
                key={entry.id}
                className="bg-card border border-border rounded-[10px] p-4 hover:border-subtle transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Avatar — name appears as text below, so the avatar is decorative */}
                  <div
                    className="w-9 h-9 rounded-full bg-primary text-white text-[12px] font-semibold flex items-center justify-center flex-shrink-0"
                    aria-hidden="true"
                  >
                    {initials}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Top row: name, date, asset, JIRA */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[13px] font-semibold text-foreground">
                        {entry.performedBy.name}
                      </span>
                      <span className="text-[12px] text-muted-foreground">•</span>
                      <span className="text-[12px] text-muted-foreground">{formatDate(entry.performedAt)}</span>

                      {entry.item && (
                        <span className="inline-flex items-center text-[10px] font-semibold bg-[#fef3c7] text-[#92400e] px-1.5 py-0.5 rounded-[4px]">
                          {entry.item.name}
                        </span>
                      )}

                      {entry.asset && (
                        <>
                          <span className="text-[12px] text-muted-foreground">•</span>
                          <Link
                            href={`/locations/${locationId}/assets/${entry.asset.id}`}
                            className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
                          >
                            <Package className="h-3 w-3" />
                            {assetText}
                          </Link>
                          {entry.asset.type && (
                            <span className="inline-flex items-center text-[10px] font-semibold bg-primary-tint text-primary px-1.5 py-0 rounded-[4px]">
                              {entry.asset.type.name}
                            </span>
                          )}
                        </>
                      )}

                      {entry.jiraIssueKey && (
                        <JiraIssueBadge issueKey={entry.jiraIssueKey} jiraBaseUrl={jiraBaseUrl} />
                      )}
                    </div>

                    {entry.description && (
                      <p className="text-[13px] text-secondary-foreground whitespace-pre-wrap break-words">
                        {entry.description}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  {canModify(entry) && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <WorkLogFormDialog
                        mode="edit"
                        locationId={locationId}
                        workLogId={entry.id}
                        initialData={{
                          assetId: entry.asset?.id ?? null,
                          itemId: entry.item?.id ?? null,
                          performedById: entry.performedBy.id,
                          performedAt: entry.performedAt.split("T")[0],
                          description: entry.description,
                          jiraIssueKey: entry.jiraIssueKey,
                        }}
                        assets={assets}
                        users={users}
                        items={items}
                        currentUserId={currentUserId}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${t("editEntry")} by ${entry.performedBy.name}`}
                          className="h-[28px] w-[28px]"
                          title={t("editEntry")}
                        >
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      </WorkLogFormDialog>

                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t("deleteEntry")} by ${entry.performedBy.name}`}
                        className="h-[28px] w-[28px] text-subtle hover:text-destructive"
                        title={t("deleteEntry")}
                        onClick={() => setDeleteId(entry.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) handleDelete(deleteId); setDeleteId(null); }}
            >
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
