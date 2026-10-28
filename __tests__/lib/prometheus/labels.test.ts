import { describe, it, expect, vi } from "vitest";

// location-path imports the Prisma client; these helpers never touch it.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { samAssetLabels, samLocationLabels } from "@/lib/prometheus/labels";

const CHAIN = [
  { name: "Campus A", fiNumber: null },
  { name: "Building 10", fiNumber: "14.10.100.001" },
  { name: "Store room", fiNumber: null },
];

describe("sam_* labels", () => {
  it("derives the location labels from the nearest FI number and the leaf name", () => {
    expect(samLocationLabels(CHAIN)).toEqual({
      sam_fi_number: "14.10.100.001",
      sam_campus: "14",
      sam_building: "10",
      sam_floor: "100",
      sam_room: "001",
      sam_location_path: "Campus A / Building 10 / Store room",
      sam_location_name: "Store room",
    });
  });

  it("fills every asset key, empty when unknown", () => {
    expect(samAssetLabels({ hostname: "rec01", type: { name: "Recorder" } }, [])).toEqual({
      sam_hostname: "rec01",
      sam_fi_number: "",
      sam_campus: "",
      sam_building: "",
      sam_floor: "",
      sam_room: "",
      sam_location_path: "",
      sam_location_name: "",
      sam_asset_type: "Recorder",
      sam_manufacturer: "",
      sam_model: "",
    });
  });
});
