/**
 * The import-compatible asset CSV's columns, shared by the import parser
 * (lib/csv/import.ts), the export that writes them back (lib/csv/export.ts)
 * and the import page's column guide. Client-safe.
 */

/** Legacy columns kept as asset custom fields: CSV column → custom field key. */
export const CUSTOM_FIELD_COLUMNS = [
  { column: "GUID", key: "GUID" },
  { column: "DIAGONAL", key: "Diagonal (inch)" },
  { column: "WIDTH", key: "Width (cm)" },
  { column: "HEIGHT", key: "Height (cm)" },
  { column: "MIC_TYPE", key: "Mic type" },
  { column: "FREQUENCY", key: "Frequency" },
  { column: "ROOM_LOCATION", key: "Room location" },
  { column: "INTEGRATOR", key: "Integrator" },
  { column: "CONTACTPERSOON", key: "Contact person" },
] as const;

/** Every column of the asset CSV, in export order. */
export const ASSET_CSV_COLUMNS = [
  "CAMPUS", "GEBOUW", "LOKAAL", "FI NUMMER",
  "TYPE", "BRAND", "MODEL", "SERIAL", "QUANTITY", "MAC", "IP_HOSTNAME",
  "INSTALL_DATE", "Factuurdatum", "Factuurnummer",
  ...CUSTOM_FIELD_COLUMNS.map((c) => c.column),
  "OWNER", "CRITICALITY", "END_OF_SUPPORT", "SUPPLIER",
];
