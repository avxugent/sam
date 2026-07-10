import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { supplierSchema, findConflictingWindows } from "@/lib/supplier-schema";

function dateCell(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });

  const current = await prisma.supplier.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Supplier not found." }, { status: 404 });

  const conflicts = await findConflictingWindows(
    {
      defaultFrom: parsed.data.defaultFrom ?? null,
      defaultUntil: parsed.data.defaultUntil ?? null,
    },
    id
  );
  if (conflicts) {
    return NextResponse.json({ error: "supplierWindowOverlap", details: conflicts }, { status: 400 });
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

    const changes: Record<string, { from: string; to: string }> = {};
    if (current.name !== supplier.name) changes["Name"] = { from: current.name, to: supplier.name };
    if ((current.contractReference ?? "") !== (supplier.contractReference ?? "")) {
      changes["Contract reference"] = { from: current.contractReference ?? "", to: supplier.contractReference ?? "" };
    }
    if ((current.contactInfo ?? "") !== (supplier.contactInfo ?? "")) {
      changes["Contact info"] = { from: current.contactInfo ?? "", to: supplier.contactInfo ?? "" };
    }
    if (dateCell(current.defaultFrom) !== dateCell(supplier.defaultFrom)) {
      changes["Default from"] = { from: dateCell(current.defaultFrom), to: dateCell(supplier.defaultFrom) };
    }
    if (dateCell(current.defaultUntil) !== dateCell(supplier.defaultUntil)) {
      changes["Default until"] = { from: dateCell(current.defaultUntil), to: dateCell(supplier.defaultUntil) };
    }

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
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Name already exists." }, { status: 409 });
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
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const count = await prisma.asset.count({ where: { supplierId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `This supplier is used by ${count} asset(s). Reassign them first.` },
      { status: 400 }
    );
  }

  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { name: true } });
  if (!supplier) return NextResponse.json({ error: "Supplier not found." }, { status: 404 });

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
