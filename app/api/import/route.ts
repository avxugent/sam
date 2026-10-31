import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseCsv } from "@/lib/csv/core";
import { parseImportRow } from "@/lib/csv/import";
import { loadImportContext } from "@/lib/csv/import-context";
import { readCsvUpload } from "@/lib/csv/upload";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { prismaErrorCode } from "@/lib/route-helpers";
import { isHostnameCompliant } from "@/lib/hostname";

/** Database errors caused by a row's own data: that row is skipped, the import goes on. */
const ROW_ERROR_REASONS: Record<string, string> = {
  P2000: "a value is too long for its column",
  P2002: "its hostname (or another unique value) is already used by another asset",
  P2003: "it refers to a record that no longer exists",
};

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

  const ctx = await loadImportContext();

  const stats = { created: 0, skipped: 0, aborted: false, errors: [] as string[] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header

    try {
      const parsed = parseImportRow(row, ctx.userIdByEmail);
      if ("skip" in parsed) {
        stats.errors.push(`Row ${rowNum}: ${parsed.skip}`);
        stats.skipped++;
        continue;
      }
      const locationId = await ctx.locationId(parsed.location);

      const typeId = parsed.typeName ? await ctx.typeId(parsed.typeName) : null;
      const manufacturerId = parsed.brandName ? await ctx.manufacturerId(parsed.brandName) : null;

      let modelId: string | null = null;
      if (parsed.modelName) {
        modelId = ctx.modelId(typeId, manufacturerId, parsed.modelName);
        if (!modelId) {
          stats.errors.push(`Row ${rowNum}: MODEL "${parsed.modelName}" does not match any existing model for this type/manufacturer, left unset.`);
        }
      }
      stats.errors.push(...parsed.warnings.map((w) => `Row ${rowNum}: ${w}`));
      // The form rejects such a hostname; import keeps it (legacy files) and
      // the hostname compliance report lists it for cleanup.
      const { hostname } = parsed.asset;
      if (hostname && !isHostnameCompliant(hostname, ctx.hostnamePattern(typeId))) {
        stats.errors.push(`Row ${rowNum}: IP_HOSTNAME "${hostname}" does not match the hostname format for its type, imported as-is.`);
      }

      // Supplier — matched/created by name (manufacturer pattern); absent → window default
      const supplierId = parsed.supplierName
        ? await ctx.supplierId(parsed.supplierName)
        : ctx.creationDefaults.supplierId;

      const { macAddresses, customFields, ...assetFields } = parsed.asset;
      await prisma.asset.create({
        data: {
          ...assetFields,
          locationId,
          typeId,
          manufacturerId,
          modelId,
          ownerId: parsed.ownerId ?? ctx.creationDefaults.ownerId,
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
      const reason = ROW_ERROR_REASONS[prismaErrorCode(err) ?? ""];
      if (reason) {
        stats.errors.push(`Row ${rowNum}: skipped, ${reason}.`);
        stats.skipped++;
        continue;
      }
      // Anything else (e.g. the database went away) is not about this row:
      // stop instead of marking every remaining row as skipped.
      console.error("[import] stopped at row", rowNum, err);
      stats.errors.push(`Row ${rowNum}: the import stopped because of a server error. Rows before it were imported; this row and the ones after it were not.`);
      stats.skipped += rows.length - i;
      stats.aborted = true;
      break;
    }
  }

  await logAudit({
    session,
    req,
    action: "IMPORT",
    entityType: "Asset",
    detail: { created: stats.created, skipped: stats.skipped, errorCount: stats.errors.length, ...(stats.aborted && { aborted: true }) },
  });

  return NextResponse.json({
    ok: true,
    created: stats.created,
    skipped: stats.skipped,
    aborted: stats.aborted,
    errors: stats.errors,
  });
}
