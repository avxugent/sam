"use client";

import { useState } from "react";

/** Checkbox selection over table rows; the "all" helpers take the rows currently visible (filtered). */
export function useRowSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelectedIn = (visible: { id: string }[]) => visible.length > 0 && visible.every((r) => selected.has(r.id));
  const someSelectedIn = (visible: { id: string }[]) => !allSelectedIn(visible) && visible.some((r) => selected.has(r.id));

  function toggleAll(visible: { id: string }[]) {
    setSelected(allSelectedIn(visible) ? new Set() : new Set(visible.map((r) => r.id)));
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return { selected, setSelected, toggleAll, toggleRow, allSelectedIn, someSelectedIn };
}

/** One page of `rows`, clamping `page` to the last page when the list shrank. */
export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  return { totalPages, safePage, pageRows: rows.slice((safePage - 1) * pageSize, safePage * pageSize) };
}
