import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseCsv } from "@/lib/csv/core";
import { readCsvUpload } from "@/lib/csv/upload";
import { isAdmin } from "@/lib/permissions";

const PREVIEW_ROWS = 5;

/** Parses an uploaded CSV without importing it: row count, columns and the first PREVIEW_ROWS rows. */
export async function POST(req: NextRequest) {
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
