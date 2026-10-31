"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BulkResultSummary } from "@/components/inventory/bulk-result-summary";
import type { BulkResult, BulkSkipReason } from "@/lib/bulk";
import { apiFetch, jsonBody } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (result: BulkResult) => void;
  /** POST endpoint of the bulk action; it answers with a BulkResult. */
  url: string;
  /** Request body built from the dialog's fields. */
  body: () => unknown;
  /** Clears the dialog's fields when it closes. */
  onReset: () => void;
  title: string;
  description: React.ReactNode;
  contentClassName?: string;
  resultTitle: string;
  resultSummary: (skipped: number) => string;
  reasonLabel: (reason: BulkSkipReason) => string;
  confirmLabel: (submitting: boolean) => React.ReactNode;
  confirmDisabled?: boolean;
  confirmClassName: string;
  /** The action's fields. */
  children: React.ReactNode;
};

/**
 * Confirm step and result summary shared by the bulk actions (decommission,
 * return to stock, relocate stock): submits once, closes when every row
 * succeeded, otherwise shows which rows were skipped and why. A failed request
 * is a toast and leaves the dialog open.
 */
export function BulkActionDialog({
  open,
  onOpenChange,
  onComplete,
  url,
  body,
  onReset,
  title,
  description,
  contentClassName,
  resultTitle,
  resultSummary,
  reasonLabel,
  confirmLabel,
  confirmDisabled,
  confirmClassName,
  children,
}: Props) {
  const showApiError = useApiErrorToast();
  const tCommon = useTranslations("common");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  function handleClose() {
    onOpenChange(false);
    onReset();
    setResult(null);
  }

  async function handleSubmit() {
    setSubmitting(true);
    const res = await apiFetch<BulkResult>(url, jsonBody("POST", body()));
    setSubmitting(false);

    if (!res.ok) {
      showApiError(res.error);
      return;
    }

    onComplete(res.data);
    if (res.data.failed.length === 0) {
      handleClose();
    } else {
      setResult(res.data);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className={contentClassName}>
        {result ? (
          <BulkResultSummary
            title={resultTitle}
            summary={resultSummary(result.failed.length)}
            failed={result.failed}
            reasonLabel={reasonLabel}
            onClose={handleClose}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            {children}
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={submitting}>
                {tCommon("cancel")}
              </Button>
              <Button size="sm" disabled={submitting || confirmDisabled} onClick={handleSubmit} className={confirmClassName}>
                {confirmLabel(submitting)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
