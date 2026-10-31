"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { RotateCcw } from "lucide-react";
import { AssetStateTable, type AssetStateRow } from "@/components/assets/asset-state-table";
import * as permissions from "@/lib/permissions";
import type { Role } from "@/lib/permissions";
import { apiFetch } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

export type DecommissionedAsset = {
  id: string;
  locationId: string;
  model: { name: string } | null;
  serialNumber: string | null;
  decommissionedAt: Date | string | null;
  decommissionNote: string | null;
  lastLocationName: string | null;
  lastLocationFiNumber: string | null;
  type: { id: string; name: string } | null;
  manufacturer: { id: string; name: string } | null;
};

export function DecommissionedTable({
  assets: initialAssets,
  userRole,
}: {
  assets: DecommissionedAsset[];
  userRole: Role;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const showApiError = useApiErrorToast();
  const t = useTranslations("decommissioned");
  const tStock = useTranslations("stock");
  const tCommon = useTranslations("common");
  const [assets, setAssets] = useState(initialAssets);

  async function handleReinstate(id: string) {
    const res = await apiFetch(`/api/assets/${id}/reinstate`, { method: "POST" });
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    setAssets((prev) => prev.filter((a) => a.id !== id));
    toast({ title: t("reinstated") });
    router.refresh();
  }

  const renderReinstate = (asset: AssetStateRow) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-primary-tint" title={t("reinstate")}>
          <RotateCcw className="h-3.5 w-3.5 text-primary" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("reinstateConfirmTitle", { name: asset.model?.name || asset.serialNumber || tStock("item") })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("reinstateConfirmDescription", { location: asset.locationName ?? t("itsLocation") })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => handleReinstate(asset.id)}
            className="bg-primary hover:bg-primary-hover text-white"
          >
            {t("reinstate")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <AssetStateTable
      rows={assets.map((a) => ({
        ...a,
        locationName: a.lastLocationName,
        locationFiNumber: a.lastLocationFiNumber,
        since: a.decommissionedAt,
        note: a.decommissionNote,
      }))}
      labels={{
        search: t("searchDecommissioned"),
        location: t("lastLocation"),
        since: t("decommissioned"),
        note: t("note"),
        empty: t("noDecommissioned"),
      }}
      renderActions={permissions.isAdmin(userRole) ? renderReinstate : undefined}
    />
  );
}
