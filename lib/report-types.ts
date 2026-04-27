export type FilterOp =
  | "eq"
  | "neq"
  | "contains"
  | "isNull"
  | "isNotNull"
  | "before"
  | "after"
  | "olderThanYears"
  | "newerThanYears";

export type ReportFilterField =
  | "typeId"
  | "manufacturerId"
  | "locationId"
  | "model"
  | "serialNumber"
  | "hostname"
  | "installationDate"
  | "invoiceDate";

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
  | "notes";

export type ReportDefinition = {
  filters: ReportFilter[];
  groupBy: GroupByField;
  columns: ColumnKey[];
};

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
};

export type GroupCount = {
  label: string;
  count: number;
};

export type ReportResult = {
  rows: ReportRow[];
  groups: GroupCount[];
  total: number;
};
