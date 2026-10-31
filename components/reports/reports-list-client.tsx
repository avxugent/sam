"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Play, Pencil, Trash2, Plus } from "lucide-react";
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
import { apiErrorMessage } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { apiFetch } from "@/lib/api-client";

type ReportSummary = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type Props = {
  reports: ReportSummary[];
  canEdit: boolean;
  isAdmin: boolean;
};

export function ReportsListClient({ reports: initial, canEdit, isAdmin }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("report");
  const tCommon = useTranslations("common");
  const tField = useTranslations("field");
  const [reports, setReports] = useState(initial);
  useEffect(() => { setReports(initial); }, [initial]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/reports/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast({ title: tCommon("error"), description: apiErrorMessage(res.error, tCommon("somethingWentWrong")), variant: "destructive" });
      return;
    }
    setReports((prev) => prev.filter((r) => r.id !== id));
    toast({ title: t("deleted") });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button asChild className="h-[36px] text-[13px] gap-1.5">
            <Link href="/reports/new">
              <Plus className="h-4 w-4" />
              {t("newReport")}
            </Link>
          </Button>
        </div>
      )}

      {reports.length === 0 ? (
        <div className="text-center py-16 border border-border rounded-[10px] bg-card">
          <p className="text-muted-foreground text-[14px] mb-3">{t("noReports")}</p>
          {canEdit && (
            <Button asChild variant="outline" className="h-[36px] text-[13px] gap-1.5">
              <Link href="/reports/new">
                <Plus className="h-4 w-4" />
                {t("newReport")}
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-[10px] border border-border overflow-hidden bg-card">
          <table className="w-full text-[13px]">
            <caption className="sr-only">{t("results")}</caption>
            <thead>
              <tr className="border-b border-border bg-background">
                <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-muted-foreground">{t("reportName")}</th>
                <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-muted-foreground hidden sm:table-cell">{t("reportDescription")}</th>
                <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-muted-foreground hidden md:table-cell">{tField("updated")}</th>
                <th scope="col" className="text-right px-4 py-[10px] text-[12px] font-medium text-muted-foreground">{tCommon("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-background transition-colors">
                  <td className="px-4 py-[11px] font-medium text-foreground">
                    <Link href={`/reports/${r.id}`} className="hover:text-primary hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-[11px] text-muted-foreground hidden sm:table-cell">
                    {r.description || <span className="italic text-subtle">—</span>}
                  </td>
                  <td className="px-4 py-[11px] text-muted-foreground hidden md:table-cell">
                    {formatDate(r.updatedAt)}
                  </td>
                  <td className="px-4 py-[11px]">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-[28px] w-[28px] p-0" asChild>
                        <Link href={`/reports/${r.id}`} aria-label={`${t("run")} ${r.name}`}>
                          <Play className="h-3.5 w-3.5 text-primary" />
                        </Link>
                      </Button>
                      {canEdit && (
                        <Button variant="ghost" size="sm" className="h-[28px] px-2 text-[12px]" asChild>
                          <Link href={`/reports/${r.id}/edit`} aria-label={`${t("editReport")} ${r.name}`}>
                            <Pencil className="h-3 w-3" />
                          </Link>
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`${t("deleteReport")} ${r.name}`}
                          className="h-[28px] px-2 text-[12px] hover:bg-[#fee2e2]"
                          onClick={() => setDeleteId(r.id)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
