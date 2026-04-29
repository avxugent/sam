"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { formatDate } from "@/lib/utils";

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
  const [reports, setReports] = useState(initial);
  useEffect(() => { setReports(initial); }, [initial]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Delete failed", description: err.error, variant: "destructive" });
      return;
    }
    setReports((prev) => prev.filter((r) => r.id !== id));
    toast({ title: "Report deleted" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button asChild className="h-[36px] text-[13px] gap-1.5">
            <Link href="/reports/new">
              <Plus className="h-4 w-4" />
              New report
            </Link>
          </Button>
        </div>
      )}

      {reports.length === 0 ? (
        <div className="text-center py-16 border border-[#e2e8f0] rounded-[10px] bg-white">
          <p className="text-[#64748b] text-[14px] mb-3">No reports yet</p>
          {canEdit && (
            <Button asChild variant="outline" className="h-[36px] text-[13px] gap-1.5">
              <Link href="/reports/new">
                <Plus className="h-4 w-4" />
                Create your first report
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-[10px] border border-[#e2e8f0] overflow-hidden bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                <th className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b]">Name</th>
                <th className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] hidden sm:table-cell">Description</th>
                <th className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] hidden md:table-cell">Updated</th>
                <th className="text-right px-4 py-[10px] text-[12px] font-medium text-[#64748b]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-[#e2e8f0] last:border-0 hover:bg-[#f8fafc] transition-colors">
                  <td className="px-4 py-[11px] font-medium text-[#0f172a]">
                    <Link href={`/reports/${r.id}`} className="hover:text-[#1e64c8] hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-[11px] text-[#64748b] hidden sm:table-cell">
                    {r.description || <span className="italic text-[#94a3b8]">—</span>}
                  </td>
                  <td className="px-4 py-[11px] text-[#64748b] hidden md:table-cell">
                    {formatDate(r.updatedAt)}
                  </td>
                  <td className="px-4 py-[11px]">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-[28px] px-2 text-[12px] gap-1" asChild>
                        <Link href={`/reports/${r.id}`}>
                          <Play className="h-3 w-3" aria-hidden="true" />
                          Run
                        </Link>
                      </Button>
                      {canEdit && (
                        <Button variant="ghost" size="sm" className="h-[28px] px-2 text-[12px]" asChild>
                          <Link href={`/reports/${r.id}/edit`} aria-label={`Edit report ${r.name}`}>
                            <Pencil className="h-3 w-3" />
                          </Link>
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete report ${r.name}`}
                          className="h-[28px] px-2 text-[12px] text-[#94a3b8] hover:text-destructive"
                          onClick={() => setDeleteId(r.id)}
                        >
                          <Trash2 className="h-3 w-3" />
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
            <AlertDialogTitle>Delete report?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The report definition will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) handleDelete(deleteId); setDeleteId(null); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
