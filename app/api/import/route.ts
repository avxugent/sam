import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { parseImportRow } from "@/lib/csv-import";
import { logAudit } from "@/lib/audit";
import { resolveAssetCreationDefaults } from "@/lib/asset-defaults";
import { isAdmin } from "@/lib/permissions";

const ALLOWED_CSV_TYPES = new Set(["text/csv", "text/plain", "application/csv"]);

/** Reads the uploaded `file` form field as text, or returns the 400 to send back. */
async function readCsvUpload(req: NextRequest): Promise<{ text: string } | { error: NextResponse }> {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return { error: NextResponse.json({ error: "No file provided." }, { status: 400 }) };
  // Accept either a CSV MIME type or a .csv extension (browsers disagree on the type).
  if (!ALLOWED_CSV_TYPES.has(file.type) && !file.name.toLowerCase().endsWith(".csv")) {
    return { error: NextResponse.json({ error: "Only CSV files are accepted." }, { status: 400 }) };
  }
  return { text: await file.text() };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const upload = await readCsvUpload(req);
  if ("error" in upload) return upload.error;
  const rows = parseCsv(upload.text);

  if (rows.length === 0) {
    return NextResponse.json({ error: "No data rows found in CSV." }, { status: 400 });
  }

  // ── Caches to avoid redundant DB lookups ──
  const typeCache = new Map<string, string>();      // name -> id
  const mfrCache = new Map<string, string>();       // name -> id
  const modelCache = new Map<string, string>();     // "typeId|manufacturerId|name" -> id

  // Pre-load existing types and manufacturers
  const existingTypes = await prisma.assetType.findMany({ select: { id: true, name: true } });
  existingTypes.forEach((t) => typeCache.set(t.name.toLowerCase(), t.id));

  const existingMfrs = await prisma.manufacturer.findMany({ select: { id: true, name: true } });
  existingMfrs.forEach((m) => mfrCache.set(m.name.toLowerCase(), m.id));

  // Models are admin-only to create (no fixed-list autocreate here, unlike
  // type/manufacturer above) — import only resolves a MODEL cell against an
  // existing Model scoped to the row's type/manufacturer; an unmatched value
  // leaves modelId unset and surfaces a row warning instead of guessing.
  const existingModels = await prisma.model.findMany({ select: { id: true, typeId: true, manufacturerId: true, name: true } });
  existingModels.forEach((m) =>
    modelCache.set(`${m.typeId}|${m.manufacturerId ?? ""}|${m.name.toLowerCase()}`, m.id)
  );
  function lookupModel(typeId: string | null, manufacturerId: string | null, name: string): string | null {
    if (!typeId) return null;
    return modelCache.get(`${typeId}|${manufacturerId ?? ""}|${name.toLowerCase()}`) ?? null;
  }

  const supplierCache = new Map<string, string>(); // name -> id
  const existingSuppliers = await prisma.supplier.findMany({ select: { id: true, name: true } });
  existingSuppliers.forEach((s) => supplierCache.set(s.name.toLowerCase(), s.id));

  const userIdByEmail = new Map<string, string>(); // email -> id
  const existingUsers = await prisma.user.findMany({ select: { id: true, email: true } });
  existingUsers.forEach((u) => userIdByEmail.set(u.email.toLowerCase(), u.id));

  // Owner/supplier defaults are resolved once — the setting and the active
  // supplier window can't change mid-import.
  const creationDefaults = await resolveAssetCreationDefaults(prisma, {});

  // Pre-load existing locations (campus/building/room)
  const existingLocations = await prisma.location.findMany({
    select: { id: true, name: true, parentId: true, fiNumber: true },
  });
  // Build lookups: parentId|name -> id, and fiNumber -> id
  const locationLookup = new Map<string, string>();
  const fiNumberLookup = new Map<string, string>();
  existingLocations.forEach((l) => {
    locationLookup.set(`${l.parentId ?? ""}|${l.name.toLowerCase()}`, l.id);
    if (l.fiNumber) fiNumberLookup.set(l.fiNumber, l.id);
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
      // If we have a fiNumber and it isn't already owned by another location, apply it —
      // but only to a room that has none yet. Record ownership only when the update applied,
      // so later rows with this FI number aren't routed to a room that kept its own.
      if (fiNumber && !fiNumberLookup.has(fiNumber)) {
        const { count } = await prisma.location.updateMany({
          where: { id: existingId, fiNumber: null },
          data: { fiNumber },
        });
        if (count > 0) fiNumberLookup.set(fiNumber, existingId);
      }
      return existingId;
    }

    // Safely handle duplicate fiNumber — if it collides, store null
    const safeFiNumber = fiNumber && !fiNumberLookup.has(fiNumber) ? fiNumber : null;

    const loc = await prisma.location.create({
      data: { name, parentId, fiNumber: safeFiNumber },
    });
    locationLookup.set(key, loc.id);
    if (safeFiNumber) fiNumberLookup.set(safeFiNumber, loc.id);
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

  async function getOrCreateSupplier(name: string): Promise<string> {
    const key = name.toLowerCase();
    if (supplierCache.has(key)) return supplierCache.get(key)!;
    const s = await prisma.supplier.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    supplierCache.set(key, s.id);
    return s.id;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header

    try {
      const parsed = parseImportRow(row, userIdByEmail);
      if ("skip" in parsed) {
        stats.errors.push(`Row ${rowNum}: ${parsed.skip}`);
        stats.skipped++;
        continue;
      }
      const { campus, building, room, fiNumber } = parsed.location;

      // Build location hierarchy; FI number is applied to the room (LOKAAL) level.
      // If a location already exists with this FI number, reuse it directly —
      // it's the authoritative key, so CAMPUS/GEBOUW/LOKAAL name drift is ignored.
      let locationId = fiNumber ? fiNumberLookup.get(fiNumber) : undefined;
      if (!locationId) {
        const campusId = campus ? await getOrCreateLocation(campus, null) : null;
        const buildingId = building ? await getOrCreateLocation(building, campusId) : null;
        locationId = await getOrCreateLocation(room, buildingId ?? campusId, fiNumber);
      }

      const typeId = parsed.typeName ? await getOrCreateType(parsed.typeName) : null;
      const manufacturerId = parsed.brandName ? await getOrCreateManufacturer(parsed.brandName) : null;

      let modelId: string | null = null;
      if (parsed.modelName) {
        modelId = lookupModel(typeId, manufacturerId, parsed.modelName);
        if (!modelId) {
          stats.errors.push(`Row ${rowNum}: MODEL "${parsed.modelName}" does not match any existing model for this type/manufacturer, left unset.`);
        }
      }
      stats.errors.push(...parsed.warnings.map((w) => `Row ${rowNum}: ${w}`));

      // Supplier — matched/created by name (manufacturer pattern); absent → window default
      const supplierId = parsed.supplierName
        ? await getOrCreateSupplier(parsed.supplierName)
        : creationDefaults.supplierId;

      const { macAddresses, customFields, ...assetFields } = parsed.asset;
      await prisma.asset.create({
        data: {
          ...assetFields,
          locationId,
          typeId,
          manufacturerId,
          modelId,
          ownerId: parsed.ownerId ?? creationDefaults.ownerId,
          supplierId,
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

  await logAudit({
    session,
    req,
    action: "IMPORT",
    entityType: "Asset",
    detail: { created: stats.created, skipped: stats.skipped, errorCount: stats.errors.length },
  });

  return NextResponse.json({
    ok: true,
    created: stats.created,
    skipped: stats.skipped,
    errors: stats.errors,
  });
}

const PREVIEW_ROWS = 5;

// Preview endpoint: parse CSV and return the first PREVIEW_ROWS rows with detected columns
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const upload = await readCsvUpload(req);
  if ("error" in upload) return upload.error;
  const rows = parseCsv(upload.text);

  return NextResponse.json({
    totalRows: rows.length,
    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    preview: rows.slice(0, PREVIEW_ROWS),
  });
}
