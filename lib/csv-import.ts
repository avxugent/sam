/**
 * Pure per-row interpretation of the asset CSV import (no database access),
 * so the rules can be unit-tested. app/api/import/route.ts resolves the names
 * returned here to ids (creating locations/types/manufacturers/suppliers as
 * needed) and persists the asset.
 *
 * CSV columns from the legacy export:
 *   GUID;FI NUMMER;CAMPUS;GEBOUW;LOKAAL;TYPE;BRAND;MODEL;SERIAL;QUANTITY;
 *   DIAGONAL;WIDTH;HEIGHT;MIC_TYPE;FREQUENCY;MAC;IP_HOSTNAME;ROOM_LOCATION;
 *   INSTALL_DATE;INTEGRATOR;CONTACTPERSOON;Factuurdatum;Factuurnummer
 * plus OWNER, CRITICALITY, END_OF_SUPPORT and SUPPLIER from the current export.
 */

import { csvValue as v, parseDate, type CsvRow } from "@/lib/csv";
import { normalizeMacAddress } from "@/lib/mac-address";
import { CRITICALITY_VALUES, parseCriticality } from "@/lib/criticality";
import { FI_NUMBER_REGEX } from "@/lib/schemas/location";
import type { Criticality } from "@/generated/prisma/enums";


/** Legacy columns kept as custom fields: [custom field key, CSV column]. */
const CUSTOM_FIELD_COLUMNS: [string, string][] = [
  ["GUID", "GUID"],
  ["Diagonal (inch)", "DIAGONAL"],
  ["Width (cm)", "WIDTH"],
  ["Height (cm)", "HEIGHT"],
  ["Mic type", "MIC_TYPE"],
  ["Frequency", "FREQUENCY"],
  ["Room location", "ROOM_LOCATION"],
  ["Integrator", "INTEGRATOR"],
  ["Contact person", "CONTACTPERSOON"],
];

export type ParsedImportRow = {
  location: { campus: string; building: string; room: string; fiNumber: string | null };
  typeName: string;
  brandName: string;
  modelName: string;
  supplierName: string;
  /** Owner id matched by OWNER email, or null (caller applies the default owner). */
  ownerId: string | null;
  asset: {
    serialNumber: string | null;
    hostname: string | null;
    quantity: number;
    installationDate: Date | null;
    invoiceDate: Date | null;
    invoiceNumber: string | null;
    endOfSupportDate: Date | null;
    criticality: Criticality | null;
    macAddresses: string[];
    customFields: { key: string; value: string }[];
  };
  /** Non-fatal problems, without the "Row N:" prefix. */
  warnings: string[];
};

export type ImportRowResult = { skip: string } | ParsedImportRow;

export function parseImportRow(row: CsvRow, userIdByEmail: Map<string, string>): ImportRowResult {
  const room = v(row, "LOKAAL");
  if (!room) return { skip: "LOKAAL is empty, skipping." };

  const warnings: string[] = [];
  const rawFi = v(row, "FI NUMMER", "FI_NUMMER");

  // Owner — matched by email; an unmatched email falls back to the default owner and warns.
  const ownerEmail = v(row, "OWNER");
  const ownerId = ownerEmail ? userIdByEmail.get(ownerEmail.toLowerCase()) ?? null : null;
  if (ownerEmail && !ownerId) {
    warnings.push(`OWNER "${ownerEmail}" does not match any user email, left unset/default.`);
  }

  // Criticality — case-insensitive enum parse; invalid → null + warning
  const criticalityRaw = v(row, "CRITICALITY");
  let criticality: Criticality | null = null;
  if (criticalityRaw) {
    criticality = parseCriticality(criticalityRaw.toUpperCase());
    if (!criticality) {
      warnings.push(`CRITICALITY "${criticalityRaw}" is not one of ${CRITICALITY_VALUES.join("/")}, ignored.`);
    }
  }

  // MAC address(es) — may be separated by ";", "," or "|" within the field.
  // Each is normalized to AA:BB:CC:DD:EE:FF; a value that can't be normalized
  // is kept as-is and flagged rather than guessed or dropped.
  const macAddresses = v(row, "MAC")
    .split(/[,;|]/)
    .map((m) => m.trim())
    .filter(Boolean)
    .map((m) => {
      const normalized = normalizeMacAddress(m);
      if (normalized === null) {
        warnings.push(`MAC address "${m}" could not be normalized, stored as-is.`);
        return m;
      }
      return normalized;
    });

  // Quantity is only meaningful for bulk items with no individual identity
  // (no serial number, hostname, or MAC address).
  const serialNumber = v(row, "SERIAL") || null;
  const hostname = v(row, "IP_HOSTNAME") || null;
  const hasIdentity = !!serialNumber || !!hostname || macAddresses.length > 0;
  const quantityRaw = v(row, "QUANTITY");
  let quantity = 1;
  if (quantityRaw) {
    const parsedQuantity = parseInt(quantityRaw, 10);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
      warnings.push(`QUANTITY "${quantityRaw}" is not a positive integer, defaulted to 1.`);
    } else if (hasIdentity && parsedQuantity !== 1) {
      warnings.push(`QUANTITY ${parsedQuantity} ignored — asset has a serial number, hostname, or MAC address.`);
    } else {
      quantity = parsedQuantity;
    }
  }

  // FI nummer is stored on the location directly — not as a custom field.
  const customFields = CUSTOM_FIELD_COLUMNS.flatMap(([key, column]) => {
    const value = v(row, column);
    return value ? [{ key, value }] : [];
  });

  return {
    location: {
      campus: v(row, "CAMPUS"),
      building: v(row, "GEBOUW"),
      room,
      // The FI number is stored on the room-level location (LOKAAL).
      fiNumber: rawFi && FI_NUMBER_REGEX.test(rawFi) ? rawFi : null,
    },
    typeName: v(row, "TYPE"),
    brandName: v(row, "BRAND"),
    modelName: v(row, "MODEL"),
    supplierName: v(row, "SUPPLIER"),
    ownerId,
    asset: {
      serialNumber,
      hostname,
      quantity,
      installationDate: parseDate(v(row, "INSTALL_DATE")),
      invoiceDate: parseDate(v(row, "Factuurdatum")),
      invoiceNumber: v(row, "Factuurnummer") || null,
      endOfSupportDate: parseDate(v(row, "END_OF_SUPPORT")),
      criticality,
      macAddresses,
      customFields,
    },
    warnings,
  };
}
