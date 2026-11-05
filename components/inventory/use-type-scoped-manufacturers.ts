"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

export type ManufacturerOption = { id: string; name: string };

/**
 * Manufacturer options for the asset and stock forms, scoped to the selected
 * asset type (only manufacturers with at least one Model under that type) and
 * refetched whenever the type changes. Responses that arrive after a newer
 * request started are ignored; a failed load is toasted and empties the list.
 *
 * The first load after opening never reports the current selection as
 * invalid, even if that manufacturer has no Model yet for this type; only a
 * genuine later type change calls `onSelectionInvalid` so the form can clear it.
 */
export function useTypeScopedManufacturers({
  open,
  typeId,
  manufacturerId,
  onSelectionInvalid,
}: {
  open: boolean;
  typeId: string;
  manufacturerId: string;
  onSelectionInvalid: () => void;
}): ManufacturerOption[] {
  const [manufacturers, setManufacturers] = useState<ManufacturerOption[]>([]);
  const isInitialLoadRef = useRef(true);
  const reportInvalid = useEffectEvent(onSelectionInvalid);
  const showApiError = useApiErrorToast();

  useEffect(() => {
    if (open) isInitialLoadRef.current = true;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams();
      if (typeId) params.set("typeId", typeId);
      const res = await apiFetch<ManufacturerOption[]>(`/api/manufacturers?${params}`);
      if (cancelled) return;
      if (!res.ok) {
        setManufacturers([]);
        showApiError(res.error);
        return;
      }
      const list = res.data;
      setManufacturers(list);
      if (!isInitialLoadRef.current && manufacturerId && !list.some((m) => m.id === manufacturerId)) {
        reportInvalid();
      }
      isInitialLoadRef.current = false;
    })();
    return () => {
      cancelled = true;
    };
  }, [open, typeId, manufacturerId, showApiError]);

  return manufacturers;
}
