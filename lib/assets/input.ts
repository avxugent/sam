import { NextResponse } from "next/server";
import { unknownReferenceResponse } from "@/lib/route-helpers";
import { prisma } from "@/lib/prisma";
import { isHostnameCompliant } from "@/lib/hostname";

/**
 * Checks on, and nested rows built from, the asset form input shared by the
 * asset create (POST /api/locations/[id]/assets) and update (PUT
 * /api/assets/[id]) routes, which do their own writes; the deploy route only
 * uses hostnameTakenResponse(). Lifecycle writes (including deploy from
 * stock) live in lib/assets/transitions.ts.
 * Each *Response helper returns the 400 to send back, or null to proceed.
 */

/** 400 unknownReference when `supplierId` is set but names no supplier. */
export async function unknownSupplierResponse(supplierId: string | null | undefined): Promise<NextResponse | null> {
  if (!supplierId) return null;
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } });
  return supplier ? null : unknownReferenceResponse("Supplier");
}

/** 400 when `hostname` breaks the hostname pattern of asset type `typeId`. */
export async function hostnameFormatResponse(
  hostname: string | null | undefined,
  typeId: string | null | undefined
): Promise<NextResponse | null> {
  if (!hostname) return null;
  const assetType = typeId
    ? await prisma.assetType.findUnique({ where: { id: typeId }, select: { hostnamePattern: true } })
    : null;
  if (isHostnameCompliant(hostname, assetType?.hostnamePattern)) return null;
  return NextResponse.json(
    { error: "Hostname does not match the required format for this asset type." },
    { status: 400 }
  );
}

/** 409 for the unique-hostname violation (hostname is the only unique Asset column) on create, update and deploy. */
export function hostnameTakenResponse(): NextResponse {
  return NextResponse.json({ error: "This hostname is already assigned to another asset." }, { status: 409 });
}

/** MAC address rows to create, skipping blank entries. */
export function macAddressRows(addresses: string[]): { address: string }[] {
  return addresses.filter(Boolean).map((address) => ({ address }));
}

/** Custom field rows to create, skipping entries without a key. */
export function customFieldRows(fields: { key: string; value: string }[]): { key: string; value: string }[] {
  return fields.filter((f) => f.key).map((f) => ({ key: f.key, value: f.value }));
}
