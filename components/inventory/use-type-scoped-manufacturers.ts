"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

export type ManufacturerOption = { id: string; name: string };

/**
 * Manufacturer options for the asset and stock forms, scoped to the selected
 * asset type (only manufacturers with at least one Model under that type) and
 * refetched whenever the type changes. Responses that arrive after a newer
 * request started are ignored.
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

  useEffect(() => {
    if (open) isInitialLoadRef.current = true;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    (async () => {
      const params = new URLSearchParams();
      if (typeId) params.set("typeId", typeId);
      const res = await fetch(`/api/manufacturers?${params}`);
      if (stale || !res.ok) return;
      const list: ManufacturerOption[] = await res.json();
      if (stale) return;
      setManufacturers(list);
      if (!isInitialLoadRef.current && manufacturerId && !list.some((m) => m.id === manufacturerId)) {
        reportInvalid();
      }
      isInitialLoadRef.current = false;
    })();
    return () => {
      stale = true;
    };
  }, [open, typeId, manufacturerId]);

  return manufacturers;
}
