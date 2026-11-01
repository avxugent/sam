"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The list state of an admin page whose rows come from its server component.
 * `applyChange` shows a successful change at once, then reloads the server data
 * (counts and other derived values) behind it; the list re-syncs when the new
 * server rows arrive.
 */
export function useServerList<T>(initial: T[]): [T[], (update: (current: T[]) => T[]) => void] {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  useEffect(() => { setItems(initial); }, [initial]);

  function applyChange(update: (current: T[]) => T[]) {
    setItems(update);
    router.refresh();
  }

  return [items, applyChange];
}
