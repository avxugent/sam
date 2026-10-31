import { describe, it, expect } from "vitest";
import {
  REPORT_FILTER_FIELDS,
  allowedFilterOps,
  filterValueInput,
  isOptionFilterField,
  parseReportDefinition,
  reportDefinitionSchema,
} from "@/lib/schemas/report";

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

describe("REPORT_FILTER_FIELDS", () => {
  it("gives every filter field a kind and at least one allowed op", () => {
    for (const [field, def] of Object.entries(REPORT_FILTER_FIELDS)) {
      expect(def.ops.length, field).toBeGreaterThan(0);
      expect(["reference", "enum", "text", "date", "workLogItem"]).toContain(def.kind);
    }
  });

  it("offers the same ops per field as the builder always has", () => {
    expect(allowedFilterOps("typeId")).toEqual(["eq", "neq", "isNull", "isNotNull"]);
    expect(allowedFilterOps("status")).toEqual(["eq", "neq"]);
    expect(allowedFilterOps("model")).toEqual(["eq", "neq", "contains", "isNull", "isNotNull"]);
    expect(allowedFilterOps("invoiceDate")).toEqual(["before", "after", "isNull", "isNotNull"]);
    expect(allowedFilterOps("lastChanged")).toEqual(["newerThanDays", "olderThanDays", "before", "after"]);
    expect(allowedFilterOps("locationWorkLogItem")).toEqual(["hasItem", "notHasItem"]);
  });
});

describe("filterValueInput()", () => {
  it("needs no value for isNull / isNotNull", () => {
    expect(filterValueInput("typeId", "isNull")).toBe("none");
    expect(filterValueInput("installationDate", "isNotNull")).toBe("none");
  });

  it("picks options for reference, enum and work-log item fields", () => {
    expect(filterValueInput("supplierId", "eq")).toBe("option");
    expect(filterValueInput("criticality", "neq")).toBe("option");
    expect(filterValueInput("workLogItem", "hasItem")).toBe("option");
    expect(isOptionFilterField("status")).toBe(true);
    expect(isOptionFilterField("hostname")).toBe(false);
  });

  it("uses a number for relative date ops and a date for absolute ones", () => {
    expect(filterValueInput("installationDate", "olderThanYears")).toBe("number");
    expect(filterValueInput("lastChanged", "newerThanDays")).toBe("number");
    expect(filterValueInput("endOfSupportDate", "before")).toBe("date");
  });

  it("uses text for text fields", () => {
    expect(filterValueInput("serialNumber", "contains")).toBe("text");
  });
});

describe("reportDefinitionSchema filters", () => {
  const asset = (filters: unknown[]) => ({ filters, groupBy: "none", columns: ["model"] });

  it("accepts every op a field allows", () => {
    const filters = Object.entries(REPORT_FILTER_FIELDS).flatMap(([field, def]) =>
      def.ops.map((op) => ({ field, op, value: "x" }))
    );
    for (let i = 0; i < filters.length; i += 20) {
      expect(reportDefinitionSchema.safeParse(asset(filters.slice(i, i + 20))).success).toBe(true);
    }
  });

  it("rejects an op the field does not allow, naming both", () => {
    const parsed = reportDefinitionSchema.safeParse(asset([{ field: "invoiceDate", op: "olderThanYears", value: "5" }]));
    expect(parsed.success).toBe(false);
    const messages = parsed.error!.issues.flatMap((issue) =>
      "errors" in issue ? (issue.errors as { message: string }[][]).flat().map((e) => e.message) : [issue.message]
    );
    expect(messages).toContain('Filter op "olderThanYears" is not allowed for field "invoiceDate"');
  });

  it("rejects contains on an id reference field", () => {
    expect(reportDefinitionSchema.safeParse(asset([{ field: "typeId", op: "contains", value: "t" }])).success).toBe(false);
  });
});
