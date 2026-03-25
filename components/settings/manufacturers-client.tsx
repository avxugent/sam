"use client";

import { LookupListManager } from "@/components/settings/lookup-list-manager";

type Manufacturer = { id: string; name: string; _count: { assets: number } };

export function ManufacturersClient({ initialManufacturers }: { initialManufacturers: Manufacturer[] }) {
  return (
    <LookupListManager
      initialItems={initialManufacturers}
      apiBase="/api/manufacturers"
      entityName="Manufacturer"
    />
  );
}
