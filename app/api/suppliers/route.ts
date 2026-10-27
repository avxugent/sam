import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { supplierSchema } from "@/lib/schemas/supplier";
import { findConflictingWindows } from "@/lib/suppliers/conflicts";
import { canManageCatalog } from "@/lib/permissions";
import { invalidInput, isUniqueConstraintError, readJsonBody } from "@/lib/route-helpers";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { assets: true } } },
  });
  return NextResponse.json(suppliers);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await readJsonBody(req);
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const conflicts = await findConflictingWindows({
    defaultFrom: parsed.data.defaultFrom ?? null,
    defaultUntil: parsed.data.defaultUntil ?? null,
  });
  if (conflicts) {
    return NextResponse.json({ error: "supplierWindowOverlap", details: conflicts }, { status: 400 });
  }

  try {
    const supplier = await prisma.supplier.create({
      data: {
        name: parsed.data.name,
        contractReference: parsed.data.contractReference ?? null,
        contactInfo: parsed.data.contactInfo ?? null,
        defaultFrom: parsed.data.defaultFrom ? new Date(parsed.data.defaultFrom) : null,
        defaultUntil: parsed.data.defaultUntil ? new Date(parsed.data.defaultUntil) : null,
      },
    });
    await logAudit({
      session,
      req,
      action: "CREATE",
      entityType: "Supplier",
      entityId: supplier.id,
      entityName: supplier.name,
    });
    return NextResponse.json(supplier, { status: 201 });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: "Name already exists." }, { status: 409 });
    }
    throw err;
  }
}
