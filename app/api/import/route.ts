import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// CSV columns from the legacy export
// GUID;FI NUMMER;CAMPUS;GEBOUW;LOKAAL;TYPE;BRAND;MODEL;SERIAL;QUANTITY;
// DIAGONAL;WIDTH;HEIGHT;MIC_TYPE;FREQUENCY;MAC;IP_HOSTNAME;ROOM_LOCATION;
// INSTALL_DATE;INTEGRATOR;CONTACTPERSOON;Factuurdatum;Factuurnummer
//
// FI NUMMER format: CC.BB.FFF.RRR (e.g. 14.10.100.013)
// It is stored on the room-level location (LOKAAL).

const FI_REGEX = /^\d{2}\.\d{2}\.\d{3}\.\d{3}$/;

type CsvRow = Record<string, string>;

function parseDate(val: string): Date | null {
  if (!val || val.trim() === "") return null;
  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
    const d = new Date(val.trim());
    return isNaN(d.getTime()) ? null : d;
  }
  // Try DD/MM/YYYY
  const dmyMatch = val.trim().match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const d = new Date(`${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`);
    return isNaN(d.getTime()) ? null : d;
  }
  // Try DD/MM/YY
  const dmyShort = val.trim().match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (dmyShort) {
    const year = parseInt(dmyShort[3]) + 2000;
    const d = new Date(`${year}-${dmyShort[2].padStart(2, "0")}-${dmyShort[1].padStart(2, "0")}`);
    return isNaN(d.getTime()) ? null : d;
  }
  // Fallback: let JS try
  const d = new Date(val.trim());
  return isNaN(d.getTime()) ? null : d;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  // Detect delimiter: try ; first, then ,
  const firstLine = lines[0];
  const delimiter = firstLine.includes(";") ? ";" : ",";

  const headers = firstLine.split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i], delimiter);
    if (values.every((v) => v.trim() === "")) continue;
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").trim().replace(/^"|"$/g, "");
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
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

function v(row: CsvRow, ...keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val !== undefined && val.trim() !== "") return val.trim();
  }
  return "";
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

  const text = await file.text();
  const rows = parseCsv(text);

  if (rows.length === 0) {
    return NextResponse.json({ error: "No data rows found in CSV." }, { status: 400 });
  }

  // ── Caches to avoid redundant DB lookups ──
  const locationCache = new Map<string, string>(); // "campus|building|room" -> id
  const typeCache = new Map<string, string>();      // name -> id
  const mfrCache = new Map<string, string>();       // name -> id

  // Pre-load existing types and manufacturers
  const existingTypes = await prisma.assetType.findMany({ select: { id: true, name: true } });
  existingTypes.forEach((t) => typeCache.set(t.name.toLowerCase(), t.id));

  const existingMfrs = await prisma.manufacturer.findMany({ select: { id: true, name: true } });
  existingMfrs.forEach((m) => mfrCache.set(m.name.toLowerCase(), m.id));

  // Pre-load existing locations (campus/building/room)
  const existingLocations = await prisma.location.findMany({
    select: { id: true, name: true, parentId: true },
  });
  // Build a lookup: parentId|name -> id
  const locationLookup = new Map<string, string>();
  existingLocations.forEach((l) => {
    locationLookup.set(`${l.parentId ?? ""}|${l.name.toLowerCase()}`, l.id);
  });

  const stats = { created: 0, skipped: 0, errors: [] as string[] };

  async function getOrCreateLocation(
    name: string,
    parentId: string | null,
    fiNumber?: string | null
  ): Promise<string> {
    const key = `${parentId ?? ""}|${name.toLowerCase()}`;
    if (locationLookup.has(key)) {
      const existingId = locationLookup.get(key)!;
      // If we have a fiNumber and the existing location doesn't, update it
      if (fiNumber) {
        await prisma.location.updateMany({
          where: { id: existingId, fiNumber: null },
          data: { fiNumber },
        });
      }
      return existingId;
    }

    // Safely handle duplicate fiNumber — if it collides, store null
    let safeFiNumber: string | null = fiNumber ?? null;
    if (safeFiNumber) {
      const existing = await prisma.location.findUnique({
        where: { fiNumber: safeFiNumber },
        select: { id: true },
      });
      if (existing) safeFiNumber = null; // already taken by another location
    }

    const loc = await prisma.location.create({
      data: { name, parentId, fiNumber: safeFiNumber },
    });
    locationLookup.set(key, loc.id);
    return loc.id;
  }

  async function getOrCreateType(name: string): Promise<string> {
    const key = name.toLowerCase();
    if (typeCache.has(key)) return typeCache.get(key)!;
    const t = await prisma.assetType.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    typeCache.set(key, t.id);
    return t.id;
  }

  async function getOrCreateManufacturer(name: string): Promise<string> {
    const key = name.toLowerCase();
    if (mfrCache.has(key)) return mfrCache.get(key)!;
    const m = await prisma.manufacturer.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    mfrCache.set(key, m.id);
    return m.id;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header

    try {
      const campus = v(row, "CAMPUS");
      const gebouw = v(row, "GEBOUW");
      const lokaal = v(row, "LOKAAL");

      if (!lokaal) {
        stats.errors.push(`Row ${rowNum}: LOKAAL is empty, skipping.`);
        stats.skipped++;
        continue;
      }

      // FI number — validated before use
      const rawFi = v(row, "FI NUMMER", "FI_NUMMER");
      const fiNumber = rawFi && FI_REGEX.test(rawFi) ? rawFi : null;

      // Build location hierarchy; FI number is applied to the room (LOKAAL) level
      let campusId: string | null = null;
      let gebouwId: string | null = null;

      if (campus) campusId = await getOrCreateLocation(campus, null);
      if (gebouw) gebouwId = await getOrCreateLocation(gebouw, campusId);
      const locationId = await getOrCreateLocation(lokaal, gebouwId ?? campusId, fiNumber);

      // Type and manufacturer
      const typeName = v(row, "TYPE");
      const brandName = v(row, "BRAND");
      const typeId = typeName ? await getOrCreateType(typeName) : null;
      const manufacturerId = brandName ? await getOrCreateManufacturer(brandName) : null;

      // Dates
      const installationDate = parseDate(v(row, "INSTALL_DATE"));
      const invoiceDate = parseDate(v(row, "Factuurdatum"));

      // MAC address(es) — may be semicolon or comma-separated within the field
      const macRaw = v(row, "MAC");
      const macAddresses = macRaw
        ? macRaw.split(/[,;|]/).map((m) => m.trim()).filter(Boolean)
        : [];

      // Custom fields — store non-empty legacy fields that don't have a direct mapping
      const customFields: { key: string; value: string }[] = [];
      const addCustom = (key: string, ...csvKeys: string[]) => {
        const val = v(row, ...csvKeys);
        if (val) customFields.push({ key, value: val });
      };

      addCustom("GUID", "GUID");
      // FI nummer is stored on the location directly — not as a custom field
      addCustom("Quantity", "QUANTITY");
      addCustom("Diagonal (inch)", "DIAGONAL");
      addCustom("Width (cm)", "WIDTH");
      addCustom("Height (cm)", "HEIGHT");
      addCustom("Mic type", "MIC_TYPE");
      addCustom("Frequency", "FREQUENCY");
      addCustom("Room location", "ROOM_LOCATION");
      addCustom("Integrator", "INTEGRATOR");
      addCustom("Contact person", "CONTACTPERSOON");

      const locationCache_key = `${campus}|${gebouw}|${lokaal}`;
      locationCache.set(locationCache_key, locationId);

      await prisma.asset.create({
        data: {
          locationId,
          typeId,
          manufacturerId,
          model: v(row, "MODEL") || null,
          serialNumber: v(row, "SERIAL") || null,
          hostname: v(row, "IP_HOSTNAME") || null,
          installationDate,
          invoiceDate,
          invoiceNumber: v(row, "Factuurnummer") || null,
          macAddresses: macAddresses.length > 0
            ? { create: macAddresses.map((address) => ({ address })) }
            : undefined,
          customFields: customFields.length > 0
            ? { create: customFields }
            : undefined,
        },
      });

      stats.created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`Row ${rowNum}: ${msg}`);
      stats.skipped++;
    }
  }

  return NextResponse.json({
    ok: true,
    created: stats.created,
    skipped: stats.skipped,
    errors: stats.errors,
  });
}

// Preview endpoint: parse CSV and return first 10 rows with detected columns
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

  const text = await file.text();
  const rows = parseCsv(text);

  return NextResponse.json({
    totalRows: rows.length,
    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    preview: rows.slice(0, 5),
  });
}
