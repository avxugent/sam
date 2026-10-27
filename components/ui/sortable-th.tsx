import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type SortDir = "asc" | "desc";

export function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronUp className="h-2.5 w-2.5 opacity-30" aria-hidden="true" />;
  return dir === "asc"
    ? <ChevronUp className="h-2.5 w-2.5 text-[#1e64c8]" aria-hidden="true" />
    : <ChevronDown className="h-2.5 w-2.5 text-[#1e64c8]" aria-hidden="true" />;
}

type SortableThProps<C extends string> = {
  col: C;
  label: string;
  sortCol: C | null;
  sortDir: SortDir;
  onSort: (col: C) => void;
  /** "compact" = small uppercase header used by the inventory tables; "default" = admin tables. */
  variant?: "default" | "compact";
  className?: string;
};

/** Sortable table header: a button inside the <th>, so it is keyboard-operable, with aria-sort on the cell. */
export function SortableTh<C extends string>({
  col,
  label,
  sortCol,
  sortDir,
  onSort,
  variant = "default",
  className,
}: SortableThProps<C>) {
  const active = sortCol === col;
  return (
    <th
      scope="col"
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("p-0 text-left text-[#64748b] whitespace-nowrap", className)}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "w-full inline-flex items-center gap-1 text-left select-none hover:bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e64c8] rounded-sm",
          variant === "compact"
            ? "px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide"
            : "px-4 py-[10px] text-[12px] font-medium"
        )}
      >
        <span className={active ? "text-[#1e64c8]" : undefined}>{label}</span>
        <SortIcon active={active} dir={sortDir} />
      </button>
    </th>
  );
}
