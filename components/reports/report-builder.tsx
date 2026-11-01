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
import { Plus, Trash2, Save, Search, X } from "lucide-react";
import type { ReportFilter, ReportFilterField, FilterOp, GroupByField, ColumnKey, ReportDefinition, ReportSource, LocationReportStatus, LocationReportPeriodUnit } from "@/lib/reports/types";
import { isLocationReport } from "@/lib/reports/types";
import { CRITICALITY_VALUES } from "@/lib/criticality";
import { apiFetch, jsonBody, apiErrorMessage } from "@/lib/api-client";
import { allowedFilterOps, filterValueInput, isOptionFilterField, type OptionFilterField } from "@/lib/schemas/report";


type AssetOption = { id: string; name: string };

type Props = {
  reportId?: string;
  initialName?: string;
  initialDescription?: string;
  initialDefinition?: ReportDefinition;
  assetTypes: AssetOption[];
  manufacturers: AssetOption[];
  locations: AssetOption[];
  locationScopeOptions: AssetOption[];
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
  locationScopeOptions,
  workLogItems,
  suppliers,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("report");
  const tField = useTranslations("field");
  const tCommon = useTranslations("common");
  const tLocation = useTranslations("location");

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
    locationWorkLogItem: tField("locationWorkLogItem"),
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

  const groupByLabels: Record<GroupByField, string> = {
    none: t("noGrouping"),
    type: tField("type"),
    manufacturer: tField("manufacturer"),
    location: tField("location"),
    installationYear: t("installationYear"),
  };
  const groupByOptions = (Object.keys(groupByLabels) as GroupByField[]).map((value) => ({ value, label: groupByLabels[value] }));

  const columnLabels: Record<ColumnKey, string> = {
    model: tField("model"),
    serialNumber: tField("serialNumber"),
    hostname: tField("hostname"),
    type: tField("type"),
    manufacturer: tField("manufacturer"),
    location: tField("location"),
    installationDate: tField("installationDate"),
    invoiceDate: tField("invoiceDate"),
    invoiceNumber: tField("invoiceNumber"),
    notes: tField("notes"),
    lastChanged: tField("lastModified"),
    supplier: tField("supplier"),
    criticality: tField("criticality"),
    endOfSupportDate: tField("endOfSupport"),
  };
  const columnOptions = (Object.keys(columnLabels) as ColumnKey[]).map((value) => ({ value, label: columnLabels[value] }));

  const assetStatusOptions: AssetOption[] = [
    { id: "INSTALLED", name: tField("installed") },
    { id: "IN_REPAIR", name: tField("inRepair") },
    { id: "DECOMMISSIONED", name: tField("decommissioned") },
  ];

  const criticalityOptions: AssetOption[] = CRITICALITY_VALUES.map((id) => ({ id, name: tCommon(`criticality.${id}`) }));

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
  const [locationScopeIds, setLocationScopeIds] = useState<string[]>(initLocation?.locationIds ?? []);
  const [scopeQuery, setScopeQuery] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleItem(id: string) {
    setItemIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  function toggleScopeLocation(id: string) {
    setLocationScopeIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  const filteredScopeOptions = scopeQuery
    ? locationScopeOptions.filter((o) => o.name.toLowerCase().includes(scopeQuery.toLowerCase()))
    : locationScopeOptions;
  const scopeNameById = new Map(locationScopeOptions.map((o) => [o.id, o.name]));

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
          const ops = allowedFilterOps(updated.field);
          if (!ops.includes(updated.op)) updated.op = ops[0];
          updated.value = "";
        }
        if (patch.op && filterValueInput(updated.field, patch.op) === "none") {
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

  const fieldOptions: Record<OptionFilterField, AssetOption[]> = {
    typeId: assetTypes,
    manufacturerId: manufacturers,
    locationId: locations,
    supplierId: suppliers,
    status: assetStatusOptions,
    criticality: criticalityOptions,
    workLogItem: workLogItems,
    locationWorkLogItem: workLogItems,
  };

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
        ...(locationScopeIds.length > 0 ? { locationIds: locationScopeIds } : {}),
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
      const res = await apiFetch<{ id: string }>(url, jsonBody(method, { name, description, definition }));
      if (!res.ok) {
        toast({ title: t("errorSaving"), description: apiErrorMessage(res.error), variant: "destructive" });
        return;
      }
      const saved = res.data;
      toast({ title: t("saved") });
      router.push(`/reports/${saved.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4 bg-card border border-border rounded-[10px] p-5">
        <h2 className="text-[14px] font-semibold text-foreground">{t("details")}</h2>
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

      <div className="space-y-3 bg-card border border-border rounded-[10px] p-5">
        <h2 className="text-[14px] font-semibold text-foreground">{t("reportType")}</h2>
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
        <p className="text-[12px] text-subtle">
          {source === "location" ? t("sourceLocationHelp") : t("sourceAssetHelp")}
        </p>
      </div>

      {/* Location report config */}
      {source === "location" && (
        <div className="space-y-4 bg-card border border-border rounded-[10px] p-5">
          <div className="space-y-2">
            <h2 className="text-[14px] font-semibold text-foreground">{t("locationScope")}</h2>
            <p className="text-[12px] text-subtle">{t("locationScopeHelp")}</p>

            {locationScopeIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {locationScopeIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full text-[11.5px] font-medium bg-primary-tint text-primary"
                  >
                    {scopeNameById.get(id) ?? id}
                    <button
                      type="button"
                      onClick={() => toggleScopeLocation(id)}
                      aria-label={t("removeScopeLocation", { name: scopeNameById.get(id) ?? id })}
                      className="hover:bg-primary-tint-hover rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-subtle" />
              <Input
                value={scopeQuery}
                onChange={(e) => setScopeQuery(e.target.value)}
                placeholder={tLocation("searchLocations")}
                className="pl-8 h-[34px] text-[12.5px]"
              />
            </div>
            <div className="border border-border rounded-[8px] overflow-y-auto max-h-48">
              {filteredScopeOptions.length === 0 ? (
                <div className="flex items-center justify-center h-16 text-[12.5px] text-subtle">
                  {tLocation("noLocationsFound")}
                </div>
              ) : (
                <ul className="divide-y divide-muted">
                  {filteredScopeOptions.map((o) => {
                    const active = locationScopeIds.includes(o.id);
                    return (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => toggleScopeLocation(o.id)}
                          className={`w-full text-left px-3 py-2 text-[12.5px] transition-colors ${
                            active ? "bg-primary-tint text-primary font-medium" : "hover:bg-background text-secondary-foreground"
                          }`}
                        >
                          {o.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-[14px] font-semibold text-foreground">{t("workLogItems")}</h2>
            {workLogItems.length === 0 ? (
              <p className="text-[12.5px] text-subtle">{t("noWorkLogItems")}</p>
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
                          ? "bg-primary text-white border-primary"
                          : "bg-card text-muted-foreground border-border hover:border-primary hover:text-primary"
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
            <h2 className="text-[14px] font-semibold text-foreground">{t("statusFilter")}</h2>
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
            <h2 className="text-[14px] font-semibold text-foreground">{t("timeWindow")}</h2>
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] text-muted-foreground">{t("withinLast")}</span>
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
            <p className="text-[12px] text-subtle">{t("timeWindowHelp")}</p>
          </div>
        </div>
      )}

      {source === "asset" && (
      <>
      <div className="space-y-3 bg-card border border-border rounded-[10px] p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-foreground">{t("filters")}</h2>
          <Button variant="outline" size="sm" className="h-[30px] text-[12.5px] gap-1" onClick={addFilter}>
            <Plus className="h-3 w-3" />
            {t("addFilter")}
          </Button>
        </div>

        {filters.length === 0 && (
          <p className="text-[12.5px] text-subtle">{t("noFilters")}</p>
        )}

        <div className="space-y-2">
          {filters.map((f, i) => {
            const availableOps = allowedFilterOps(f.field);
            const inputType = filterValueInput(f.field, f.op);
            const options = isOptionFilterField(f.field) ? fieldOptions[f.field] : null;

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
                      type={inputType === "option" ? "text" : inputType}
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
                  className="h-[34px] w-[34px] p-0 text-subtle hover:text-destructive"
                  onClick={() => removeFilter(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 bg-card border border-border rounded-[10px] p-5">
        <h2 className="text-[14px] font-semibold text-foreground">{t("groupBy")}</h2>
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

      <div className="space-y-3 bg-card border border-border rounded-[10px] p-5">
        <h2 className="text-[14px] font-semibold text-foreground">{t("columns")}</h2>
        <div className="flex flex-wrap gap-2">
          {columnOptions.map((c) => {
            const active = columns.includes(c.value);
            return (
              <button
                key={c.value}
                onClick={() => toggleColumn(c.value)}
                className={`px-3 py-1 rounded-full text-[12px] font-medium border transition-colors ${
                  active
                    ? "bg-primary text-white border-primary"
                    : "bg-card text-muted-foreground border-border hover:border-primary hover:text-primary"
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
