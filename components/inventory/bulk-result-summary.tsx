"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Response of the bulk asset/stock endpoints. */
export type BulkResult = { succeeded: string[]; failed: { id: string; reason: string }[] };

/** Dialog body listing the items a bulk action skipped, with the reason for each. */
export function BulkResultSummary({
  title,
  summary,
  failed,
  reasonLabel,
  onClose,
}: {
  title: string;
  summary: string;
  failed: BulkResult["failed"];
  reasonLabel: (reason: string) => string;
  onClose: () => void;
}) {
  const tCommon = useTranslations("common");
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <p className="text-[13px] text-[#64748b]">{summary}</p>
      <ul className="text-[12.5px] text-[#64748b] space-y-1 max-h-48 overflow-y-auto">
        {failed.map((f) => (
          <li key={f.id} className="flex justify-between gap-2 border-b border-[#f1f5f9] py-1">
            <span className="font-mono text-[11.5px]">{f.id}</span>
            <span>{reasonLabel(f.reason)}</span>
          </li>
        ))}
      </ul>
      <DialogFooter>
        <Button size="sm" onClick={onClose}>{tCommon("close")}</Button>
      </DialogFooter>
    </>
  );
}
