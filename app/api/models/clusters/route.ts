import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getModelClusters } from "@/lib/model-clusters";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "MAINTAINER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clusters = await getModelClusters();
  return NextResponse.json({ clusters });
}
