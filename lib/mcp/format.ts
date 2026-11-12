import { toIsoDay } from "@/lib/dates";

/**
 * Slim shapes the MCP tools return. Deliberately leave out the Vault path,
 * notes, invoice data and soft user references: an assistant asking "what is
 * in room X" does not need them, and they would only fill its context.
 */

type AssetRow = {
  id: string;
  hostname: string | null;
  serialNumber: string | null;
  status: string;
  quantity: number;
  installationDate: Date | null;
  type: { name: string } | null;
  manufacturer: { name: string } | null;
  model: { id?: string; name: string } | null;
  location: { id: string; name: string };
};

export function assetSummary(a: AssetRow) {
  return {
    id: a.id,
    hostname: a.hostname,
    serialNumber: a.serialNumber,
    status: a.status,
    quantity: a.quantity,
    type: a.type?.name ?? null,
    manufacturer: a.manufacturer?.name ?? null,
    model: a.model?.name ?? null,
    modelId: a.model?.id ?? null,
    location: a.location,
    installationDate: toIsoDay(a.installationDate),
  };
}

type AssetDetailRow = AssetRow & {
  warrantyMonths: number | null;
  endOfSupportDate: Date | null;
  criticality: string | null;
  macAddresses: { address: string }[];
  customFields: { key: string; value: string }[];
  supplier: { name: string } | null;
};

export function assetDetail(a: AssetDetailRow, locationPath: string) {
  return {
    ...assetSummary(a),
    locationPath,
    warrantyMonths: a.warrantyMonths,
    endOfSupportDate: toIsoDay(a.endOfSupportDate),
    criticality: a.criticality,
    supplier: a.supplier?.name ?? null,
    macAddresses: a.macAddresses.map((m) => m.address),
    customFields: Object.fromEntries(a.customFields.map((f) => [f.key, f.value])),
  };
}

type StockRow = {
  id: string;
  serialNumber: string | null;
  quantity: number;
  type: { name: string };
  manufacturer: { name: string } | null;
  model: { id: string; name: string };
  location: { id: string; name: string } | null;
};

export function stockSummary(s: StockRow) {
  return {
    id: s.id,
    serialNumber: s.serialNumber,
    quantity: s.quantity,
    type: s.type.name,
    manufacturer: s.manufacturer?.name ?? null,
    model: s.model.name,
    modelId: s.model.id,
    location: s.location,
  };
}

export type TextResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export function jsonResult(data: unknown): TextResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

export function errorResult(message: string): TextResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
