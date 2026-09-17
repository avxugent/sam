"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

type LocationOption = { id: string; breadcrumb: string };

export function StockLocationFilter({ locations }: { locations: LocationOption[] }) {
  const t = useTranslations("stock");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLocationId = searchParams.get("locationId") ?? "";

  const ALL = "__all__";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value !== ALL) params.set("locationId", value);
    else params.delete("locationId");
    router.push(`${pathname}?${params.toString()}`);
  }

  const currentLabel = locations.find((l) => l.id === currentLocationId)?.breadcrumb
    ?? t("allLocations");

  return (
    <Select value={currentLocationId || ALL} onValueChange={handleChange}>
      <SelectTrigger className="h-8 w-56 text-[12.5px]">
        <span className="flex items-center gap-1.5 truncate">
          <MapPin className="h-3.5 w-3.5 text-[#94a3b8] flex-shrink-0" />
          <span className="truncate">{currentLabel}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t("allLocations")}</SelectItem>
        {locations.map((l) => (
          <SelectItem key={l.id} value={l.id}>{l.breadcrumb}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
