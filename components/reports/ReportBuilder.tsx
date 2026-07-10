"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import type { ReportFilter, ReportFilterField, FilterOp, GroupByField, ColumnKey, ReportDefinition, ReportSource, LocationReportStatus, LocationReportPeriodUnit } from "@/lib/report-types";
import { isLocationReport } from "@/lib/report-types";


const FIELD_OPS: Record<ReportFilterField, FilterOp[]> = {
  typeId: ["eq", "neq", "isNull", "isNotNull"],
  manufacturerId: ["eq", "neq", "isNull", "isNotNull"],
  locationId: ["eq", "neq", "isNull", "isNotNull"],
  status: ["eq", "neq"],
  model: ["eq", "neq", "contains", "isNull", "isNotNull"],
  serialNumber: ["eq", "neq", "contains", "isNull", "isNotNull"],
  hostname: ["eq", "neq", "contains", "isNull", "isNotNull"],
  installationDate: ["before", "after", "olderThanYears", "newerThanYears", "isNull", "isNotNull"],
  invoiceDate: ["before", "after", "isNull", "isNotNull"],
  lastChanged: ["newerThanDays", "olderThanDays", "before", "after"],
  workLogItem: ["hasItem", "notHasItem"],
  supplierId: ["eq", "neq", "isNull", "isNotNull"],
  criticality: ["eq", "neq", "isNull", "isNotNull"],
  endOfSupportDate: ["before", "after", "olderThanYears", "newerThanYears", "isNull", "isNotNull"],
};


const OPS_NEEDING_VALUE: FilterOp[] = ["eq", "neq", "contains", "before", "after", "olderThanYears", "newerThanYears", "newerThanDays", "olderThanDays", "hasItem", "notHasItem"];

type AssetOption = { id: string; name: string };

type Props = {
  reportId?: string;
  initialName?: string;
  initialDescription?: string;
  initialDefinition?: ReportDefinition;
  assetTypes: AssetOption[];
  manufacturers: AssetOption[];
  locations: AssetOption[];
  workLogItems: AssetOption[];
  suppliers: AssetOption[];
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
  workLogItems,
  suppliers,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("report");
  const tField = useTranslations("field");
  const tCommon = useTranslations("common");

  const fieldLabels: Record<ReportFilterField, string> = {
    typeId: tField("type"),
    manufacturerId: tField("manufacturer"),
    locationId: tField("location"),
    status: tField("status"),
    model: tField("model"),
    serialNumber: tField("serialNumber"),
    hostname: tField("hostname"),
    installationDate: tField("installationDate"),
    invoiceDate: tField("invoiceDate"),
    lastChanged: tField("lastModified"),
    workLogItem: tField("workLogItem"),
    supplierId: tField("supplier"),
    criticality: tField("criticality"),
    endOfSupportDate: tField("endOfSupport"),
  };

  const opLabels: Record<FilterOp, string> = {
    eq: t("opEq"),
    neq: t("opNeq"),
    contains: t("opContains"),
    isNull: t("opIsNull"),
    isNotNull: t("opIsNotNull"),
    before: t("opBefore"),
    after: t("opAfter"),
    olderThanYears: t("opOlderThanYears"),
    newerThanYears: t("opNewerThanYears"),
    newerThanDays: t("opNewerThanDays"),
    olderThanDays: t("opOlderThanDays"),
    hasItem: t("opHasItem"),
    notHasItem: t("opNotHasItem"),
  };

  const groupByOptions = [
    { value: "none" as GroupByField, label: t("noGrouping") },
    { value: "type" as GroupByField, label: tField("type") },
    { value: "manufacturer" as GroupByField, label: tField("manufacturer") },
    { value: "location" as GroupByField, label: tField("location") },
    { value: "installationYear" as GroupByField, label: t("installationYear") },
  ];

  const columnOptions = [
    { value: "model" as ColumnKey, label: tField("model") },
    { value: "serialNumber" as ColumnKey, label: tField("serialNumber") },
    { value: "hostname" as ColumnKey, label: tField("hostname") },
    { value: "type" as ColumnKey, label: tField("type") },
    { value: "manufacturer" as ColumnKey, label: tField("manufacturer") },
    { value: "location" as ColumnKey, label: tField("location") },
    { value: "installationDate" as ColumnKey, label: tField("installationDate") },
    { value: "invoiceDate" as ColumnKey, label: tField("invoiceDate") },
    { value: "invoiceNumber" as ColumnKey, label: tField("invoiceNumber") },
    { value: "notes" as ColumnKey, label: tField("notes") },
    { value: "lastChanged" as ColumnKey, label: tField("lastModified") },
    { value: "supplier" as ColumnKey, label: tField("supplier") },
    { value: "criticality" as ColumnKey, label: tField("criticality") },
    { value: "endOfSupportDate" as ColumnKey, label: tField("endOfSupport") },
  ];

  const assetStatusOptions: AssetOption[] = [
    { id: "INSTALLED", name: tField("installed") },
    { id: "DECOMMISSIONED", name: tField("decommissioned") },
  ];

  const criticalityOptions: AssetOption[] = [
    { id: "LOW", name: tCommon("criticality.LOW") },
    { id: "MEDIUM", name: tCommon("criticality.MEDIUM") },
    { id: "HIGH", name: tCommon("criticality.HIGH") },
    { id: "CRITICAL", name: tCommon("criticality.CRITICAL") },
  ];

  const initLocation = initialDefinition && isLocationReport(initialDefinition) ? initialDefinition : null;
  const initAsset = initialDefinition && !isLocationReport(initialDefinition) ? initialDefinition : null;

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [source, setSource] = useState<ReportSource>(initLocation ? "location" : "asset");
  const [filters, setFilters] = useState<ReportFilter[]>(initAsset?.filters ?? []);
  const [groupBy, setGroupBy] = useState<GroupByField>(initAsset?.groupBy ?? "none");
  const [columns, setColumns] = useState<ColumnKey[]>(initAsset?.columns ?? DEFAULT_COLUMNS);
  const [itemIds, setItemIds] = useState<string[]>(initLocation?.itemIds ?? []);
  const [locationStatus, setLocationStatus] = useState<LocationReportStatus>(initLocation?.status ?? "all");
  const [periodCount, setPeriodCount] = useState<string>(initLocation?.periodCount ? String(initLocation.periodCount) : "");
  const [periodUnit, setPeriodUnit] = useState<LocationReportPeriodUnit>(initLocation?.periodUnit ?? "years");
  const [saving, setSaving] = useState(false);

  function toggleItem(id: string) {
    setItemIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  const sourceOptions = [
    { value: "asset" as ReportSource, label: t("sourceAsset") },
    { value: "location" as ReportSource, label: t("sourceLocation") },
  ];

  const statusOptions = [
    { value: "all" as LocationReportStatus, label: t("statusAll") },
    { value: "filled" as LocationReportStatus, label: t("statusFilled") },
    { value: "notFilled" as LocationReportStatus, label: t("statusNotFilled") },
  ];

  const periodUnitOptions = [
    { value: "days" as LocationReportPeriodUnit, label: t("unitDays") },
    { value: "months" as LocationReportPeriodUnit, label: t("unitMonths") },
    { value: "years" as LocationReportPeriodUnit, label: t("unitYears") },
  ];

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
    if (op === "olderThanYears" || op === "newerThanYears" || op === "newerThanDays" || op === "olderThanDays") return "number";
    if (field === "installationDate" || field === "invoiceDate" || field === "lastChanged" || field === "endOfSupportDate") return "date";
    return "text";
  }

  function optionsForField(field: ReportFilterField): AssetOption[] | null {
    if (field === "typeId") return assetTypes;
    if (field === "manufacturerId") return manufacturers;
    if (field === "locationId") return locations;
    if (field === "status") return assetStatusOptions;
    if (field === "workLogItem") return workLogItems;
    if (field === "supplierId") return suppliers;
    if (field === "criticality") return criticalityOptions;
    return null;
  }

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: t("nameRequired"), variant: "destructive" });
      return;
    }

    let definition: ReportDefinition;
    if (source === "location") {
      if (itemIds.length === 0) {
        toast({ title: t("selectItem"), variant: "destructive" });
        return;
      }
      const count = parseInt(periodCount, 10);
      const hasPeriod = Number.isFinite(count) && count > 0;
      definition = {
        source: "location",
        itemIds,
        status: locationStatus,
        ...(hasPeriod ? { periodCount: count, periodUnit } : {}),
      };
    } else {
      if (columns.length === 0) {
        toast({ title: t("selectColumn"), variant: "destructive" });
        return;
      }
      definition = { source: "asset", filters, groupBy, columns };
    }

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
        toast({ title: t("errorSaving"), description: err.error, variant: "destructive" });
        return;
      }
      const saved = await res.json();
      toast({ title: t("saved") });
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
        <h2 className="text-[14px] font-semibold text-[#0f172a]">{t("details")}</h2>
        <div className="space-y-1.5">
          <Label htmlFor="report-name" className="text-[12.5px]">
            {t("reportName")} <span aria-hidden="true" className="text-destructive">*</span>
          </Label>
          <Input
            id="report-name"
            required
            aria-required="true"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className="h-[36px] text-[13px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-desc" className="text-[12.5px]">{t("reportDescription")}</Label>
          <Input
            id="report-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
            className="h-[36px] text-[13px]"
          />
        </div>
      </div>

      {/* Report type */}
      <div className="space-y-3 bg-white border border-[#e2e8f0] rounded-[10px] p-5">
        <h2 className="text-[14px] font-semibold text-[#0f172a]">{t("reportType")}</h2>
        <Select value={source} onValueChange={(v) => setSource(v as ReportSource)}>
          <SelectTrigger className="h-[36px] text-[13px] w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sourceOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[12px] text-[#94a3b8]">
          {source === "location" ? t("sourceLocationHelp") : t("sourceAssetHelp")}
        </p>
      </div>

      {/* Location report config */}
      {source === "location" && (
        <div className="space-y-4 bg-white border border-[#e2e8f0] rounded-[10px] p-5">
          <div className="space-y-2">
            <h2 className="text-[14px] font-semibold text-[#0f172a]">{t("workLogItems")}</h2>
            {workLogItems.length === 0 ? (
              <p className="text-[12.5px] text-[#94a3b8]">{t("noWorkLogItems")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {workLogItems.map((it) => {
                  const active = itemIds.includes(it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => toggleItem(it.id)}
                      className={`px-3 py-1 rounded-full text-[12px] font-medium border transition-colors ${
                        active
                          ? "bg-[#1e64c8] text-white border-[#1e64c8]"
                          : "bg-white text-[#64748b] border-[#e2e8f0] hover:border-[#1e64c8] hover:text-[#1e64c8]"
                      }`}
                    >
                      {it.name}
                    </button>
                  );
                })}
              </div>
            )}
            {itemIds.length === 0 && workLogItems.length > 0 && (
              <p className="text-[12px] text-destructive">{t("selectItemError")}</p>
            )}
          </div>
          <div className="space-y-2">
            <h2 className="text-[14px] font-semibold text-[#0f172a]">{t("statusFilter")}</h2>
            <Select value={locationStatus} onValueChange={(v) => setLocationStatus(v as LocationReportStatus)}>
              <SelectTrigger className="h-[36px] text-[13px] w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <h2 className="text-[14px] font-semibold text-[#0f172a]">{t("timeWindow")}</h2>
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] text-[#64748b]">{t("withinLast")}</span>
              <Input
                type="number"
                min={1}
                value={periodCount}
                onChange={(e) => setPeriodCount(e.target.value)}
                placeholder={t("anyTimePlaceholder")}
                className="h-[34px] text-[12.5px] w-[90px]"
                aria-label={t("timeWindow")}
              />
              <Select value={periodUnit} onValueChange={(v) => setPeriodUnit(v as LocationReportPeriodUnit)}>
                <SelectTrigger className="h-[34px] text-[12.5px] w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodUnitOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[12px] text-[#94a3b8]">{t("timeWindowHelp")}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      {source === "asset" && (
      <>
      <div className="space-y-3 bg-white border border-[#e2e8f0] rounded-[10px] p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[#0f172a]">{t("filters")}</h2>
          <Button variant="outline" size="sm" className="h-[30px] text-[12.5px] gap-1" onClick={addFilter}>
            <Plus className="h-3 w-3" />
            {t("addFilter")}
          </Button>
        </div>

        {filters.length === 0 && (
          <p className="text-[12.5px] text-[#94a3b8]">{t("noFilters")}</p>
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
                    {(Object.keys(fieldLabels) as ReportFilterField[]).map((fk) => (
                      <SelectItem key={fk} value={fk}>{fieldLabels[fk]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={f.op} onValueChange={(v) => updateFilter(i, { op: v as FilterOp })}>
                  <SelectTrigger className="h-[34px] text-[12.5px] w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableOps.map((op) => (
                      <SelectItem key={op} value={op}>{opLabels[op]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {inputType !== "none" && (
                  options ? (
                    <Select value={f.value ?? ""} onValueChange={(v) => updateFilter(i, { value: v })}>
                      <SelectTrigger className="h-[34px] text-[12.5px] w-[180px]">
                        <SelectValue placeholder={t("selectPlaceholder")} />
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
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("removeFilter", { n: i + 1 })}
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
        <h2 className="text-[14px] font-semibold text-[#0f172a]">{t("groupBy")}</h2>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByField)}>
          <SelectTrigger className="h-[36px] text-[13px] w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groupByOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Columns */}
      <div className="space-y-3 bg-white border border-[#e2e8f0] rounded-[10px] p-5">
        <h2 className="text-[14px] font-semibold text-[#0f172a]">{t("columns")}</h2>
        <div className="flex flex-wrap gap-2">
          {columnOptions.map((c) => {
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
          <p className="text-[12px] text-destructive">{t("selectColumnError")}</p>
        )}
      </div>
      </>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 h-[38px] text-[13px]">
          <Save className="h-4 w-4" />
          {saving ? tCommon("saving") : reportId ? tCommon("saveChanges") : t("saveReport")}
        </Button>
      </div>
    </div>
  );
}
