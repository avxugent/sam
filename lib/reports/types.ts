import type { LocationReportDefinition, ReportDefinition } from "@/lib/schemas/report";
import type { Criticality } from "@/generated/prisma/enums";

export type ReportSource = ReportDefinition["source"];

export type LocationReportStatus = LocationReportDefinition["status"];

export type LocationReportPeriodUnit = NonNullable<LocationReportDefinition["periodUnit"]>;

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
  supplier: string | null;
  // Effective value: asset override ?? type default ?? null
  criticality: Criticality | null;
  endOfSupportDate: string | null;
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
