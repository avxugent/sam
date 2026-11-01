/**
 * CSV utilities: parsing for the import route, cell escaping for every CSV export.
 * Client-safe (no server imports).
 */

export type CsvRow = Record<string, string>;

/**
 * Parses a date string in multiple common formats:
 *   YYYY-MM-DD (ISO)
 *   DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
 *   DD/MM/YY  (2-digit year, treated as 20xx)
 * Returns null if the value is empty or unparseable.
 */
export function parseCsvDate(val: string): Date | null {
  if (!val || val.trim() === "") return null;

  const s = val.trim();

  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY (or - or . separators)
  const dmyFull = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyFull) {
    const d = new Date(
      `${dmyFull[3]}-${dmyFull[2].padStart(2, "0")}-${dmyFull[1].padStart(2, "0")}`
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YY (2-digit year → 20xx)
  const dmyShort = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (dmyShort) {
    const year = parseInt(dmyShort[3]) + 2000;
    const d = new Date(
      `${year}-${dmyShort[2].padStart(2, "0")}-${dmyShort[1].padStart(2, "0")}`
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback: let JS try (handles some other formats like "Jan 01 2024")
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Splits a single CSV line respecting quoted fields.
 * Handles escaped double-quotes ("") inside quoted fields.
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside a quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Splits CSV text into records on line breaks that are outside quoted
 * fields, so a quoted cell may itself contain newlines.
 */
function splitCsvRecords(text: string): string[] {
  const records: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes; // an escaped "" toggles twice, so state stays right
    if (!inQuotes && (ch === "\n" || (ch === "\r" && text[i + 1] === "\n"))) {
      if (ch === "\r") i++;
      records.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  records.push(current);
  return records;
}

/**
 * Quotes a cell for CSV output when it contains the delimiter, a quote or a
 * line break (doubling inner quotes). Every CSV export uses ";".
 */
export function escapeCsvCell(value: string | null | undefined): string {
  const s = value ?? "";
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Parses a full CSV text into an array of row objects.
 * - Auto-detects delimiter (`;` preferred over `,`)
 * - Unquotes header and value cells ("" inside a quoted cell is a literal quote)
 * - Allows line breaks inside quoted cells
 * - Skips blank rows
 * - Returns [] when fewer than 2 lines (no data beyond header)
 */
export function parseCsv(text: string): CsvRow[] {
  const lines = splitCsvRecords(text).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const firstLine = lines[0];
  const delimiter = firstLine.includes(";") ? ";" : ",";

  const headers = splitCsvLine(firstLine, delimiter).map((h) => h.trim());

  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i], delimiter);
    if (values.every((v) => v.trim() === "")) continue;
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      // splitCsvLine already removed the quoting; stripping again would eat a real trailing quote.
      row[h] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Convenience helper: returns the first non-empty value for any of the
 * given CSV column names, or "" if none found.
 */
export function csvValue(row: CsvRow, ...keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val !== undefined && val.trim() !== "") return val.trim();
  }
  return "";
}
