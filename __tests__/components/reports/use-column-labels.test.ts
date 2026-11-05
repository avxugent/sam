import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: (ns: string) => (key: string) => `${ns}.${key}` }));

import { useColumnLabels } from "@/components/reports/use-column-labels";

describe("useColumnLabels", () => {
  it("labels every report column from the field namespace", () => {
    const { result } = renderHook(() => useColumnLabels());
    expect(result.current).toEqual({
      model: "field.model",
      serialNumber: "field.serialNumber",
      hostname: "field.hostname",
      type: "field.type",
      manufacturer: "field.manufacturer",
      location: "field.location",
      installationDate: "field.installationDate",
      invoiceDate: "field.invoiceDate",
      invoiceNumber: "field.invoiceNumber",
      notes: "field.notes",
      lastChanged: "field.lastModified",
      supplier: "field.supplier",
      criticality: "field.criticality",
      endOfSupportDate: "field.endOfSupport",
    });
  });
});
