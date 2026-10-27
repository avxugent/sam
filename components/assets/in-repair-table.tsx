"use client";

import { useTranslations } from "next-intl";
import { AssetStateTable } from "@/components/assets/asset-state-table";

export type InRepairAsset = {
  id: string;
  locationId: string;
  model: { name: string } | null;
  serialNumber: string | null;
  repairStartedAt: Date | string | null;
  repairNote: string | null;
  type: { id: string; name: string } | null;
  manufacturer: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
};

export function InRepairTable({ assets }: { assets: InRepairAsset[] }) {
  const t = useTranslations("repair");
  return (
    <AssetStateTable
      rows={assets.map((a) => ({ ...a, locationName: a.location?.name ?? null, since: a.repairStartedAt, note: a.repairNote }))}
      labels={{
        search: t("searchInRepair"),
        location: t("lastLocation"),
        since: t("repairStartedAt"),
        note: t("note"),
        empty: t("noInRepair"),
      }}
    />
  );
}
