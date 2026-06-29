export type FilterOp =
  | "eq"
  | "neq"
  | "contains"
  | "isNull"
  | "isNotNull"
  | "before"
  | "after"
  | "olderThanYears"
  | "newerThanYears"
  | "newerThanDays"
  | "olderThanDays"
  | "hasItem"
  | "notHasItem";

export type ReportFilterField =
  | "typeId"
  | "manufacturerId"
  | "locationId"
  | "model"
  | "serialNumber"
  | "hostname"
  | "installationDate"
  | "invoiceDate"
  | "lastChanged"
  | "workLogItem";

export type ReportFilter = {
  field: ReportFilterField;
  op: FilterOp;
  value?: string;
};

export type GroupByField =
  | "type"
  | "manufacturer"
  | "location"
  | "installationYear"
  | "none";

export type ColumnKey =
  | "model"
  | "serialNumber"
  | "hostname"
  | "type"
  | "manufacturer"
  | "location"
  | "installationDate"
  | "invoiceDate"
  | "invoiceNumber"
  | "notes"
  | "lastChanged";

export type ReportSource = "asset" | "location";

// Asset report — the original report shape. `source` is optional so existing
// saved reports (which predate the location report type) still parse as asset.
export type AssetReportDefinition = {
  source?: "asset";
  filters: ReportFilter[];
  groupBy: GroupByField;
  columns: ColumnKey[];
};

// Location report — a per-location coverage matrix over fixed work-log items.
// Each selected item becomes a column showing whether the leaf location has
// that item filled in (i.e. at least one work-log entry with that item).
export type LocationReportStatus = "all" | "filled" | "notFilled";

export type LocationReportPeriodUnit = "days" | "months" | "years";

export type LocationReportDefinition = {
  source: "location";
  itemIds: string[];
  status: LocationReportStatus;
  // Optional time window. When set, an item only counts as "filled" if its
  // most recent entry falls within the window (e.g. 1 year). Combined with
  // status "notFilled" this answers "not reviewed in the last year".
  periodCount?: number;
  periodUnit?: LocationReportPeriodUnit;
};

export type ReportDefinition = AssetReportDefinition | LocationReportDefinition;

export function isLocationReport(def: ReportDefinition): def is LocationReportDefinition {
  return def.source === "location";
}

export type ReportRow = {
  id: string;
  model: string | null;
  serialNumber: string | null;
  hostname: string | null;
  type: string | null;
  manufacturer: string | null;
  location: string | null;
  locationId: string | null;
  installationDate: string | null;
  invoiceDate: string | null;
  invoiceNumber: string | null;
  notes: string | null;
  lastChanged: string | null;
};

export type GroupCount = {
  label: string;
  count: number;
};

export type AssetReportResult = {
  source: "asset";
  rows: ReportRow[];
  groups: GroupCount[];
  total: number;
};

export type LocationItemStatus = {
  // Within the requested window (or ever, when no window is set).
  filled: boolean;
  date: string | null; // most recent performedAt (YYYY-MM-DD), even if stale
  performedBy: string | null;
};

export type LocationReportRow = {
  id: string; // location id
  locationId: string;
  name: string;
  path: string;
  fiNumber: string | null;
  // Top-of-tree grouping labels derived from the ancestor chain.
  campus: string | null;
  building: string | null;
  // itemId -> coverage status
  items: Record<string, LocationItemStatus>;
};

export type LocationReportResult = {
  source: "location";
  itemColumns: { id: string; name: string }[];
  rows: LocationReportRow[];
  total: number;
  filledCount: number; // rows where every selected item is filled
  notFilledCount: number; // rows where at least one selected item is missing
};

export type ReportResult = AssetReportResult | LocationReportResult;
