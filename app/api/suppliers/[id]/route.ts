import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { auditChanges } from "@/lib/audit/diff";
import { supplierSchema } from "@/lib/schemas/supplier";
import { findConflictingWindows } from "@/lib/suppliers/conflicts";
import { canManageCatalog } from "@/lib/permissions";
import { invalidInput, isUniqueConstraintError, nameTakenResponse, notFoundResponse, readJsonBody } from "@/lib/route-helpers";
import { toIsoDay } from "@/lib/utils";

function dateCell(d: Date | null): string {
  return toIsoDay(d) ?? "";
}

/** Replaces the supplier: optional fields left out of the body are cleared. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody(req);
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const current = await prisma.supplier.findUnique({ where: { id } });
  if (!current) return notFoundResponse("Supplier");

  const conflicts = await findConflictingWindows(
    {
      defaultFrom: parsed.data.defaultFrom ?? null,
      defaultUntil: parsed.data.defaultUntil ?? null,
    },
    id
  );
  if (conflicts) {
    return NextResponse.json(
      { error: "Default window overlaps another supplier", code: "supplierWindowOverlap", details: conflicts },
      { status: 400 }
    );
  }

  try {
    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        name: parsed.data.name,
        contractReference: parsed.data.contractReference ?? null,
        contactInfo: parsed.data.contactInfo ?? null,
        defaultFrom: parsed.data.defaultFrom ? new Date(parsed.data.defaultFrom) : null,
        defaultUntil: parsed.data.defaultUntil ? new Date(parsed.data.defaultUntil) : null,
      },
    });

    // Empty and missing values both read as "" in the supplier audit trail.
    const changes = auditChanges([
      { label: "Name", before: current.name, after: supplier.name },
      { label: "Contract reference", before: current.contractReference ?? "", after: supplier.contractReference ?? "" },
      { label: "Contact info", before: current.contactInfo ?? "", after: supplier.contactInfo ?? "" },
      { label: "Default from", before: dateCell(current.defaultFrom), after: dateCell(supplier.defaultFrom) },
      { label: "Default until", before: dateCell(current.defaultUntil), after: dateCell(supplier.defaultUntil) },
    ]);

    await logAudit({
      session,
      req,
      action: "UPDATE",
      entityType: "Supplier",
      entityId: id,
      entityName: supplier.name,
      detail: Object.keys(changes).length > 0 ? { changes } : undefined,
    });
    return NextResponse.json(supplier);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return nameTakenResponse();
    }
    throw err;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const count = await prisma.asset.count({ where: { supplierId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `This supplier is used by ${count} asset(s). Reassign them first.` },
      { status: 400 }
    );
  }

  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { name: true } });
  if (!supplier) return notFoundResponse("Supplier");

  await prisma.supplier.delete({ where: { id } });
  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "Supplier",
    entityId: id,
    entityName: supplier.name,
  });
  return NextResponse.json({ ok: true });
}
