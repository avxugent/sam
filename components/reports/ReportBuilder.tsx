"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Save } from "lucide-react";
import type { ReportFilter, ReportFilterField, FilterOp, GroupByField, ColumnKey, ReportDefinition } from "@/lib/report-types";

const FIELD_LABELS: Record<ReportFilterField, string> = {
  typeId: "Asset Type",
  manufacturerId: "Manufacturer",
  locationId: "Location",
  model: "Model",
  serialNumber: "Serial Number",
  hostname: "Hostname",
  installationDate: "Installation Date",
  invoiceDate: "Invoice Date",
};

const OP_LABELS: Record<FilterOp, string> = {
  eq: "equals",
  neq: "does not equal",
  contains: "contains",
  isNull: "is empty",
  isNotNull: "is not empty",
  before: "before",
  after: "after",
  olderThanYears: "older than (years)",
  newerThanYears: "newer than (years)",
};

const FIELD_OPS: Record<ReportFilterField, FilterOp[]> = {
  typeId: ["eq", "neq", "isNull", "isNotNull"],
  manufacturerId: ["eq", "neq", "isNull", "isNotNull"],
  locationId: ["eq", "neq", "isNull", "isNotNull"],
  model: ["eq", "neq", "contains", "isNull", "isNotNull"],
  serialNumber: ["eq", "neq", "contains", "isNull", "isNotNull"],
  hostname: ["eq", "neq", "contains", "isNull", "isNotNull"],
  installationDate: ["before", "after", "olderThanYears", "newerThanYears", "isNull", "isNotNull"],
  invoiceDate: ["before", "after", "isNull", "isNotNull"],
};

const GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "type", label: "Asset Type" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "location", label: "Location" },
  { value: "installationYear", label: "Installation Year" },
];

const COLUMN_OPTIONS: { value: ColumnKey; label: string }[] = [
  { value: "model", label: "Model" },
  { value: "serialNumber", label: "Serial Number" },
  { value: "hostname", label: "Hostname" },
  { value: "type", label: "Type" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "location", label: "Location" },
  { value: "installationDate", label: "Installation Date" },
  { value: "invoiceDate", label: "Invoice Date" },
  { value: "invoiceNumber", label: "Invoice Number" },
  { value: "notes", label: "Notes" },
];

const OPS_NEEDING_VALUE: FilterOp[] = ["eq", "neq", "contains", "before", "after", "olderThanYears", "newerThanYears"];

type AssetOption = { id: string; name: string };

type Props = {
  reportId?: string;
  initialName?: string;
  initialDescription?: string;
  initialDefinition?: ReportDefinition;
  assetTypes: AssetOption[];
  manufacturers: AssetOption[];
  locations: AssetOption[];
};

const DEFAULT_COLUMNS: ColumnKey[] = ["type", "manufacturer", "model", "serialNumber", "hostname", "location", "installationDate"];

export function ReportBuilder({
  reportId,
  initialName = "",
  initialDescription = "",
  initialDefinition,
  assetTypes,
  manufacturers,
  locations,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [filters, setFilters] = useState<ReportFilter[]>(initialDefinition?.filters ?? []);
  const [groupBy, setGroupBy] = useState<GroupByField>(initialDefinition?.groupBy ?? "none");
  const [columns, setColumns] = useState<ColumnKey[]>(initialDefinition?.columns ?? DEFAULT_COLUMNS);
  const [saving, setSaving] = useState(false);

  function addFilter() {
    setFilters((prev) => [...prev, { field: "typeId", op: "eq", value: "" }]);
  }

  function removeFilter(i: number) {
    setFilters((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateFilter(i: number, patch: Partial<ReportFilter>) {
    setFilters((prev) =>
      prev.map((f, idx) => {
        if (idx !== i) return f;
        const updated = { ...f, ...patch };
        if (patch.field) {
          const ops = FIELD_OPS[updated.field];
          if (!ops.includes(updated.op)) updated.op = ops[0];
          updated.value = "";
        }
        if (patch.op && !OPS_NEEDING_VALUE.includes(patch.op as FilterOp)) {
          updated.value = undefined;
        }
        return updated;
      })
    );
  }

  function toggleColumn(col: ColumnKey) {
    setColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  }

  function valueInputType(field: ReportFilterField, op: FilterOp): "text" | "number" | "date" | "none" {
    if (!OPS_NEEDING_VALUE.includes(op)) return "none";
    if (op === "olderThanYears" || op === "newerThanYears") return "number";
    if (field === "installationDate" || field === "invoiceDate") return "date";
    return "text";
  }

  function optionsForField(field: ReportFilterField): AssetOption[] | null {
    if (field === "typeId") return assetTypes;
    if (field === "manufacturerId") return manufacturers;
    if (field === "locationId") return locations;
    return null;
  }

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (columns.length === 0) {
      toast({ title: "Select at least one column", variant: "destructive" });
      return;
    }

    const definition: ReportDefinition = { filters, groupBy, columns };
    setSaving(true);
    try {
      const url = reportId ? `/api/reports/${reportId}` : "/api/reports";
      const method = reportId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, definition }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Error saving report", description: err.error, variant: "destructive" });
        return;
      }
      const saved = await res.json();
      toast({ title: reportId ? "Report updated" : "Report created" });
      router.push(`/reports/${saved.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Name & description */}
      <div className="space-y-4 bg-white border border-[#e2e8f0] rounded-[10px] p-5">
        <h2 className="text-[14px] font-semibold text-[#0f172a]">Report details</h2>
        <div className="space-y-1.5">
          <Label htmlFor="report-name" className="text-[12.5px]">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="report-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Assets older than 5 years"
            className="h-[36px] text-[13px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-desc" className="text-[12.5px]">Description</Label>
          <Input
            id="report-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="h-[36px] text-[13px]"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3 bg-white border border-[#e2e8f0] rounded-[10px] p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[#0f172a]">Filters</h2>
          <Button variant="outline" size="sm" className="h-[30px] text-[12.5px] gap-1" onClick={addFilter}>
            <Plus className="h-3 w-3" />
            Add filter
          </Button>
        </div>

        {filters.length === 0 && (
          <p className="text-[12.5px] text-[#94a3b8]">No filters — report will include all assets.</p>
        )}

        <div className="space-y-2">
          {filters.map((f, i) => {
            const availableOps = FIELD_OPS[f.field];
            const inputType = valueInputType(f.field, f.op);
            const options = optionsForField(f.field);

            return (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <Select value={f.field} onValueChange={(v) => updateFilter(i, { field: v as ReportFilterField })}>
                  <SelectTrigger className="h-[34px] text-[12.5px] w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FIELD_LABELS) as ReportFilterField[]).map((fk) => (
                      <SelectItem key={fk} value={fk}>{FIELD_LABELS[fk]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={f.op} onValueChange={(v) => updateFilter(i, { op: v as FilterOp })}>
                  <SelectTrigger className="h-[34px] text-[12.5px] w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableOps.map((op) => (
                      <SelectItem key={op} value={op}>{OP_LABELS[op]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {inputType !== "none" && (
                  options ? (
                    <Select value={f.value ?? ""} onValueChange={(v) => updateFilter(i, { value: v })}>
                      <SelectTrigger className="h-[34px] text-[12.5px] w-[180px]">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((o) => (
                          <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={inputType}
                      value={f.value ?? ""}
                      onChange={(e) => updateFilter(i, { value: e.target.value })}
                      placeholder={inputType === "number" ? "e.g. 5" : ""}
                      className="h-[34px] text-[12.5px] w-[140px]"
                    />
                  )
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-[34px] w-[34px] p-0 text-[#94a3b8] hover:text-destructive"
                  onClick={() => removeFilter(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Group by */}
      <div className="space-y-3 bg-white border border-[#e2e8f0] rounded-[10px] p-5">
        <h2 className="text-[14px] font-semibold text-[#0f172a]">Group by</h2>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByField)}>
          <SelectTrigger className="h-[36px] text-[13px] w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUP_BY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Columns */}
      <div className="space-y-3 bg-white border border-[#e2e8f0] rounded-[10px] p-5">
        <h2 className="text-[14px] font-semibold text-[#0f172a]">Columns</h2>
        <div className="flex flex-wrap gap-2">
          {COLUMN_OPTIONS.map((c) => {
            const active = columns.includes(c.value);
            return (
              <button
                key={c.value}
                onClick={() => toggleColumn(c.value)}
                className={`px-3 py-1 rounded-full text-[12px] font-medium border transition-colors ${
                  active
                    ? "bg-[#1e64c8] text-white border-[#1e64c8]"
                    : "bg-white text-[#64748b] border-[#e2e8f0] hover:border-[#1e64c8] hover:text-[#1e64c8]"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        {columns.length === 0 && (
          <p className="text-[12px] text-destructive">Select at least one column.</p>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 h-[38px] text-[13px]">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : reportId ? "Save changes" : "Save report"}
        </Button>
      </div>
    </div>
  );
}
