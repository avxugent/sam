import { describe, it, expect } from "vitest";
import { parseImportRow, type ParsedImportRow } from "@/lib/csv/import";
import { FI_NUMBER_REGEX } from "@/lib/schemas/location";

const users = new Map([["owner@x.com", "u-owner"]]);
const parse = (row: Record<string, string>) => parseImportRow({ LOKAAL: "Room 1", ...row }, users);
const ok = (row: Record<string, string>) => parse(row) as ParsedImportRow;

describe("parseImportRow()", () => {
  it("skips rows without a LOKAAL", () => {
    expect(parseImportRow({ CAMPUS: "C" }, users)).toEqual({ skip: "LOKAAL is empty, skipping." });
  });

  it("keeps a valid FI number and drops a malformed one", () => {
    expect(ok({ "FI NUMMER": "14.10.100.013" }).location.fiNumber).toBe("14.10.100.013");
    expect(ok({ FI_NUMMER: "14.10.100.13" }).location.fiNumber).toBe("14.10.100.13");
    expect(ok({ "FI NUMMER": "14-10-100" }).location.fiNumber).toBeNull();
    expect(FI_NUMBER_REGEX.test("14.10.100.0133")).toBe(false);
  });

  it("matches the owner by email, case-insensitively, else warns", () => {
    expect(ok({ OWNER: "OWNER@x.com" }).ownerId).toBe("u-owner");
    const unmatched = ok({ OWNER: "nobody@x.com" });
    expect(unmatched.ownerId).toBeNull();
    expect(unmatched.warnings[0]).toMatch(/OWNER "nobody@x.com"/);
  });

  it("parses criticality case-insensitively and warns on unknown values", () => {
    expect(ok({ CRITICALITY: "high" }).asset.criticality).toBe("HIGH");
    const bad = ok({ CRITICALITY: "EXTREME" });
    expect(bad.asset.criticality).toBeNull();
    expect(bad.warnings[0]).toMatch(/CRITICALITY "EXTREME"/);
  });

  it("splits and normalizes MACs, keeping unrecoverable ones with a warning", () => {
    const row = ok({ MAC: "aa-bb-cc-dd-ee-ff, 001122334455 | junk" });
    expect(row.asset.macAddresses).toEqual(["AA:BB:CC:DD:EE:FF", "00:11:22:33:44:55", "junk"]);
    expect(row.warnings).toEqual(['MAC address "junk" could not be normalized, stored as-is.']);
  });

  it("keeps a hostname without a MAC but warns (the form would reject it)", () => {
    const row = ok({ IP_HOSTNAME: "pc1.example.com" });
    expect(row.asset.hostname).toBe("pc1.example.com");
    expect(row.warnings).toEqual(['IP_HOSTNAME "pc1.example.com" has no MAC address; the asset form requires one, imported as-is.']);
    expect(ok({ IP_HOSTNAME: "pc1.example.com", MAC: "001122334455" }).warnings).toEqual([]);
  });

  it("applies quantity only to rows without an identity", () => {
    expect(ok({ QUANTITY: "4" }).asset.quantity).toBe(4);
    const withSerial = ok({ QUANTITY: "4", SERIAL: "SN1" });
    expect(withSerial.asset.quantity).toBe(1);
    expect(withSerial.warnings[0]).toMatch(/QUANTITY 4 ignored/);
    expect(ok({ QUANTITY: "zero" }).warnings[0]).toMatch(/not a positive integer/);
  });

  it("maps legacy columns to custom fields and parses dates", () => {
    const row = ok({ GUID: "g-1", DIAGONAL: "55", INSTALL_DATE: "31/12/2024", Factuurnummer: "F-9" });
    expect(row.asset.customFields).toEqual([
      { key: "GUID", value: "g-1" },
      { key: "Diagonal (inch)", value: "55" },
    ]);
    expect(row.asset.installationDate?.toISOString().slice(0, 10)).toBe("2024-12-31");
    expect(row.asset.invoiceNumber).toBe("F-9");
  });
});
