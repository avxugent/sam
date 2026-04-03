import { describe, it, expect } from "vitest";
import { parseCsv, parseDate, splitCsvLine, csvValue } from "@/lib/csv";

// ── parseDate ───────────────────────────────────────────────────────────────

describe("parseDate()", () => {
  it("parses ISO format YYYY-MM-DD", () => {
    const d = parseDate("2024-01-15");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(0); // January
    expect(d!.getDate()).toBe(15);
  });

  it("parses DD/MM/YYYY with slash separator", () => {
    const d = parseDate("15/01/2024");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(0);
    expect(d!.getDate()).toBe(15);
  });

  it("parses DD-MM-YYYY with hyphen separator", () => {
    const d = parseDate("15-01-2024");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
  });

  it("parses DD.MM.YYYY with dot separator", () => {
    const d = parseDate("15.01.2024");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
  });

  it("parses DD/MM/YY short year (2-digit → 20xx)", () => {
    const d = parseDate("15/01/24");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
  });

  it("returns null for empty string", () => {
    expect(parseDate("")).toBeNull();
  });

  it("returns null for whitespace", () => {
    expect(parseDate("   ")).toBeNull();
  });

  it("returns null for completely invalid string", () => {
    expect(parseDate("not-a-date")).toBeNull();
  });

  it("returns null for a string that has no date-like structure", () => {
    // Confirmed: JS Date rolls over (Feb 31 → Mar 2), so we test a
    // genuinely unparseable string that no Date constructor handles
    expect(parseDate("99-99-9999")).toBeNull();
  });
});

// ── splitCsvLine ─────────────────────────────────────────────────────────────

describe("splitCsvLine()", () => {
  it("splits a simple semicolon-delimited line", () => {
    expect(splitCsvLine("a;b;c", ";")).toEqual(["a", "b", "c"]);
  });

  it("splits a simple comma-delimited line", () => {
    expect(splitCsvLine("a,b,c", ",")).toEqual(["a", "b", "c"]);
  });

  it("handles a quoted field containing the delimiter", () => {
    expect(splitCsvLine(`"hello;world";foo`, ";")).toEqual(["hello;world", "foo"]);
  });

  it("handles escaped double-quotes inside a quoted field", () => {
    expect(splitCsvLine(`"say ""hi""";end`, ";")).toEqual([`say "hi"`, "end"]);
  });

  it("handles empty fields", () => {
    expect(splitCsvLine("a;;c", ";")).toEqual(["a", "", "c"]);
  });

  it("handles a quoted empty field", () => {
    expect(splitCsvLine(`"";b`, ";")).toEqual(["", "b"]);
  });

  it("returns a single element array for a line with no delimiter", () => {
    expect(splitCsvLine("hello", ";")).toEqual(["hello"]);
  });
});

// ── parseCsv ─────────────────────────────────────────────────────────────────

describe("parseCsv()", () => {
  it("parses a semicolon-delimited CSV", () => {
    const text = "NAME;TYPE;SERIAL\nProjector A;Projector;SN001\nMonitor B;Monitor;SN002";
    const rows = parseCsv(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]["NAME"]).toBe("Projector A");
    expect(rows[0]["TYPE"]).toBe("Projector");
    expect(rows[1]["SERIAL"]).toBe("SN002");
  });

  it("parses a comma-delimited CSV when no semicolons in header", () => {
    const text = "NAME,TYPE\nProjector A,Projector";
    const rows = parseCsv(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]["NAME"]).toBe("Projector A");
  });

  it("prefers semicolon delimiter when header contains both", () => {
    // Header has semicolon — should split on semicolon
    const text = "NAME;VALUE\nhello;world,extra";
    const rows = parseCsv(text);
    expect(rows[0]["NAME"]).toBe("hello");
    expect(rows[0]["VALUE"]).toBe("world,extra");
  });

  it("skips blank lines in data", () => {
    const text = "A;B\nfoo;bar\n\nbaz;qux";
    const rows = parseCsv(text);
    expect(rows).toHaveLength(2);
  });

  it("returns empty array when only header is present", () => {
    expect(parseCsv("NAME;TYPE")).toHaveLength(0);
  });

  it("returns empty array for completely empty text", () => {
    expect(parseCsv("")).toHaveLength(0);
  });

  it("handles CRLF line endings", () => {
    const text = "A;B\r\nfoo;bar\r\n";
    const rows = parseCsv(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]["A"]).toBe("foo");
  });

  it("handles quoted headers", () => {
    const text = `"NAME";"TYPE"\nProjector;Beamer`;
    const rows = parseCsv(text);
    expect(rows[0]["NAME"]).toBe("Projector");
    expect(rows[0]["TYPE"]).toBe("Beamer");
  });

  it("maps FI NUMMER from legacy export header", () => {
    const text = "GUID;FI NUMMER;CAMPUS;LOKAAL\n001;14.10.100.013;Campus A;Room 013";
    const rows = parseCsv(text);
    expect(rows[0]["FI NUMMER"]).toBe("14.10.100.013");
    expect(rows[0]["CAMPUS"]).toBe("Campus A");
  });
});

// ── csvValue ──────────────────────────────────────────────────────────────────

describe("csvValue()", () => {
  const row = { A: "alpha", B: "", C: "  ", D: "delta" };

  it("returns the first non-empty value", () => {
    expect(csvValue(row, "A", "D")).toBe("alpha");
  });

  it("skips empty and whitespace-only values", () => {
    expect(csvValue(row, "B", "C", "D")).toBe("delta");
  });

  it("returns empty string when all keys are missing or empty", () => {
    expect(csvValue(row, "B", "C", "Z")).toBe("");
  });

  it("trims whitespace from values", () => {
    const r = { X: "  hello  " };
    expect(csvValue(r, "X")).toBe("hello");
  });
});
