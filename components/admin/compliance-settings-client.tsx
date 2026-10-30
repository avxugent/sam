"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save } from "lucide-react";
import { apiErrorMessage } from "@/lib/utils";
import { apiFetch, jsonBody } from "@/lib/api-client";

export function ComplianceSettingsClient({
  initialRequireTwoFactor,
  initialAuditRetentionDays,
  initialDefaultOwnerId,
  initialReviewWorkLogItemId,
  initialReviewPeriodMonths,
  users,
  workLogItems,
}: {
  initialRequireTwoFactor: boolean;
  initialAuditRetentionDays: number;
  initialDefaultOwnerId: string | null;
  initialReviewWorkLogItemId: string | null;
  initialReviewPeriodMonths: number;
  users: Array<{ id: string; name: string }>;
  workLogItems: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [requireTwoFactor, setRequireTwoFactor] = useState(initialRequireTwoFactor);
  const [auditRetentionDays, setAuditRetentionDays] = useState(String(initialAuditRetentionDays));
  const [defaultOwnerId, setDefaultOwnerId] = useState(initialDefaultOwnerId ?? "");
  const [reviewWorkLogItemId, setReviewWorkLogItemId] = useState(initialReviewWorkLogItemId ?? "");
  const [reviewPeriodMonths, setReviewPeriodMonths] = useState(String(initialReviewPeriodMonths));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const retention = parseInt(auditRetentionDays, 10);
    const period = parseInt(reviewPeriodMonths, 10);
    if (isNaN(retention) || retention < 30 || retention > 3650) {
      toast({ title: tCommon("error"), description: t("complianceRetentionInvalid"), variant: "destructive" });
      return;
    }
    if (isNaN(period) || period < 1 || period > 120) {
      toast({ title: tCommon("error"), description: t("complianceReviewPeriodInvalid"), variant: "destructive" });
      return;
    }

    setSaving(true);
    const res = await apiFetch("/api/settings/compliance", jsonBody("PUT", {
        requireTwoFactor,
        auditRetentionDays: retention,
        defaultOwnerId: defaultOwnerId || null,
        reviewWorkLogItemId: reviewWorkLogItemId || null,
        reviewPeriodMonths: period,
      }));
    setSaving(false);

    if (!res.ok) {
      toast({ title: tCommon("error"), description: apiErrorMessage(res.error), variant: "destructive" });
      return;
    }
    toast({ title: t("saved") });
  }

  const selectClass =
    "w-full h-9 px-3 rounded-md border border-input bg-transparent text-[13px] focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <section className="bg-card border border-border rounded-[10px] p-6 space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">{t("complianceTitle")}</h2>
        <p className="text-[13px] text-muted-foreground mt-1">{t("complianceHelp")}</p>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="require-2fa"
          checked={requireTwoFactor}
          onCheckedChange={(v) => setRequireTwoFactor(!!v)}
        />
        <Label htmlFor="require-2fa" className="text-sm font-normal cursor-pointer">
          {t("complianceRequire2fa")}
        </Label>
      </div>
      <p className="text-[12px] text-muted-foreground -mt-3 ml-6">{t("complianceRequire2faHelp")}</p>

      <div className="space-y-2">
        <Label htmlFor="audit-retention">{t("complianceRetention")}</Label>
        <Input
          id="audit-retention"
          type="number"
          min={30}
          max={3650}
          value={auditRetentionDays}
          onChange={(e) => setAuditRetentionDays(e.target.value)}
          className="max-w-[140px]"
        />
        <p className="text-[12px] text-muted-foreground">{t("complianceRetentionHelp")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="default-owner">{t("complianceDefaultOwner")}</Label>
        <select
          id="default-owner"
          value={defaultOwnerId}
          onChange={(e) => setDefaultOwnerId(e.target.value)}
          className={selectClass}
        >
          <option value="">{t("complianceDefaultOwnerNone")}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <p className="text-[12px] text-muted-foreground">{t("complianceDefaultOwnerHelp")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="review-item">{t("complianceReviewItem")}</Label>
        <select
          id="review-item"
          value={reviewWorkLogItemId}
          onChange={(e) => setReviewWorkLogItemId(e.target.value)}
          className={selectClass}
        >
          <option value="">{t("complianceReviewItemNone")}</option>
          {workLogItems.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <p className="text-[12px] text-muted-foreground">{t("complianceReviewItemHelp")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="review-period">{t("complianceReviewPeriod")}</Label>
        <Input
          id="review-period"
          type="number"
          min={1}
          max={120}
          value={reviewPeriodMonths}
          onChange={(e) => setReviewPeriodMonths(e.target.value)}
          className="max-w-[140px]"
        />
        <p className="text-[12px] text-muted-foreground">{t("complianceReviewPeriodHelp")}</p>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? tCommon("saving") : tCommon("save")}
        </Button>
      </div>
    </section>
  );
}
