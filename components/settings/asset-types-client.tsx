"use client";

import { LookupListManager } from "@/components/settings/lookup-list-manager";

type AssetType = { id: string; name: string; _count: { assets: number } };

export function AssetTypesClient({ initialTypes }: { initialTypes: AssetType[] }) {
  return (
    <LookupListManager
      initialItems={initialTypes}
      apiBase="/api/asset-types"
      entityName="Asset Type"
    />
  );
}
