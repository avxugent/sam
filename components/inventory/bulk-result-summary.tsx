"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BulkResult } from "@/lib/assets/bulk";

/** Dialog body listing the items a bulk action skipped, with the reason for each. */
export function BulkResultSummary({
  title,
  summary,
  failed,
  onClose,
}: {
  title: string;
  summary: string;
  failed: BulkResult["failed"];
  onClose: () => void;
}) {
  const tCommon = useTranslations("common");
  const tDecom = useTranslations("decommissioned");
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <p className="text-[13px] text-muted-foreground">{summary}</p>
      <ul className="text-[12.5px] text-muted-foreground space-y-1 max-h-48 overflow-y-auto">
        {failed.map((f) => (
          <li key={f.id} className="flex justify-between gap-2 border-b border-muted py-1">
            <span className="font-mono text-[11.5px]">{f.id}</span>
            <span>{tDecom(`bulkSkipReason.${f.reason}`)}</span>
          </li>
        ))}
      </ul>
      <DialogFooter>
        <Button size="sm" onClick={onClose}>{tCommon("close")}</Button>
      </DialogFooter>
    </>
  );
}
