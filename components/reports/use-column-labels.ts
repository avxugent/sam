"use client";

import { useTranslations } from "next-intl";
import type { ColumnKey } from "@/lib/schemas/report";

/** Display label of every asset-report column, shared by the builder's column picker and the viewer's headers. */
export function useColumnLabels(): Record<ColumnKey, string> {
  const tField = useTranslations("field");
  return {
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
}
