import { prisma } from "@/lib/prisma";
import { resolveAssetCreationDefaults } from "@/lib/assets/defaults";
import type { ParsedImportRow } from "@/lib/csv/import";

/**
 * Case-insensitive name -> id lookup over `existing`; a name it has not seen
 * is upserted once and remembered for later rows.
 */
function nameResolver(existing: { id: string; name: string }[], upsert: (name: string) => Promise<{ id: string }>) {
  const cache = new Map(existing.map((r) => [r.name.toLowerCase(), r.id]));
  return async (name: string): Promise<string> => {
    const key = name.toLowerCase();
    const cached = cache.get(key);
    if (cached) return cached;
    const { id } = await upsert(name);
    cache.set(key, id);
    return id;
  };
}

/**
 * Lookups and on-demand creation for one CSV import run (POST /api/import):
 * everything is loaded once up front and cached across rows, so the row loop
 * only resolves names to ids and writes assets.
 */
export async function loadImportContext() {
  const [existingTypes, existingMfrs, existingSuppliers, existingModels, existingUsers, existingLocations] = await Promise.all([
    prisma.assetType.findMany({ select: { id: true, name: true, hostnamePattern: true } }),
    prisma.manufacturer.findMany({ select: { id: true, name: true } }),
    prisma.supplier.findMany({ select: { id: true, name: true } }),
    prisma.model.findMany({ select: { id: true, typeId: true, manufacturerId: true, name: true } }),
    prisma.user.findMany({ select: { id: true, email: true } }),
    prisma.location.findMany({ select: { id: true, name: true, parentId: true, fiNumber: true } }),
  ]);

  // Types, manufacturers and suppliers named in the CSV are created on demand.
  const typeId = nameResolver(existingTypes, (name) =>
    prisma.assetType.upsert({ where: { name }, create: { name }, update: {} })
  );
  const manufacturerId = nameResolver(existingMfrs, (name) =>
    prisma.manufacturer.upsert({ where: { name }, create: { name }, update: {} })
  );
  const supplierId = nameResolver(existingSuppliers, (name) =>
    prisma.supplier.upsert({ where: { name }, create: { name }, update: {} })
  );

  // Types created by this import have no pattern: the FQDN rule applies.
  const patternByTypeId = new Map(existingTypes.map((t) => [t.id, t.hostnamePattern]));
  function hostnamePattern(typeId: string | null): string | null {
    return typeId ? patternByTypeId.get(typeId) ?? null : null;
  }

  // Models are admin-only to create (no fixed-list autocreate here, unlike
  // type/manufacturer above) — import only resolves a MODEL cell against an
  // existing Model scoped to the row's type/manufacturer; an unmatched value
  // leaves modelId unset and surfaces a row warning instead of guessing.
  const modelCache = new Map<string, string>(); // "typeId|manufacturerId|name" -> id
  existingModels.forEach((m) =>
    modelCache.set(`${m.typeId}|${m.manufacturerId ?? ""}|${m.name.toLowerCase()}`, m.id)
  );
  function modelId(typeId: string | null, manufacturerId: string | null, name: string): string | null {
    if (!typeId) return null;
    return modelCache.get(`${typeId}|${manufacturerId ?? ""}|${name.toLowerCase()}`) ?? null;
  }

  const userIdByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u.id]));

  // Owner/supplier defaults are resolved once — the setting and the active
  // supplier window can't change mid-import.
  const creationDefaults = await resolveAssetCreationDefaults(prisma, {});

  // Location lookups: parentId|name -> id, and fiNumber -> id
  const locationLookup = new Map<string, string>();
  const fiNumberLookup = new Map<string, string>();
  existingLocations.forEach((l) => {
    locationLookup.set(`${l.parentId ?? ""}|${l.name.toLowerCase()}`, l.id);
    if (l.fiNumber) fiNumberLookup.set(l.fiNumber, l.id);
  });

  async function getOrCreateLocation(name: string, parentId: string | null, fiNumber?: string | null): Promise<string> {
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

  /**
   * The room a row belongs in, creating campus/building/room as needed. A
   * known FI number is the authoritative key, so CAMPUS/GEBOUW/LOKAAL name
   * drift is ignored for it; otherwise the FI number is applied to the room.
   */
  async function locationId({ campus, building, room, fiNumber }: ParsedImportRow["location"]): Promise<string> {
    const byFi = fiNumber ? fiNumberLookup.get(fiNumber) : undefined;
    if (byFi) return byFi;
    const campusId = campus ? await getOrCreateLocation(campus, null) : null;
    const buildingId = building ? await getOrCreateLocation(building, campusId) : null;
    return getOrCreateLocation(room, buildingId ?? campusId, fiNumber);
  }

  return { typeId, hostnamePattern, manufacturerId, supplierId, modelId, locationId, userIdByEmail, creationDefaults };
}
