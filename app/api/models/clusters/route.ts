import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getModelClusters } from "@/lib/model-clusters";
import { canManageCatalog } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clusters = await getModelClusters();
  return NextResponse.json({ clusters });
}
