import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@/lib/schemas/report";

describe("parseReportDefinition()", () => {
  it("returns null for text that is not JSON", () => {
    expect(parseReportDefinition("{not json")).toBeNull();
  });

  it("returns null for JSON that no longer matches the schema", () => {
    expect(parseReportDefinition(JSON.stringify({ source: "location", locationIds: "nope" }))).toBeNull();
  });

  it("parses a valid stored definition", () => {
    const definition = { source: "location", itemIds: ["i1"], status: "all" };
    expect(parseReportDefinition(JSON.stringify(definition))).toEqual(definition);
  });
});
