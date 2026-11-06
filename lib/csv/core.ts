/**
 * CSV utilities: parsing for the import route, cell escaping for every CSV export.
 * Client-safe (no server imports).
 */

export type CsvRow = Record<string, string>;

/** UTC midnight of the given day, or null when that day does not exist (31/02 does not roll into March). */
function utcDay(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d : null;
}

/**
 * Parses a date string in one of these formats, as UTC midnight:
 *   YYYY-MM-DD (ISO)
 *   DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
 *   DD/MM/YY  (2-digit year, treated as 20xx)
 * Returns null if the value is empty, in another format, or names a day that
 * does not exist.
 */
export function parseCsvDate(val: string): Date | null {
  const s = val.trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return utcDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // DD/MM/YYYY or DD/MM/YY (- or . separators too; a 2-digit year is 20xx)
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4}|\d{2})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? Number(dmy[3]) + 2000 : Number(dmy[3]);
    return utcDay(year, Number(dmy[2]), Number(dmy[1]));
  }

  return null;
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
