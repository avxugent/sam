import { NextResponse } from "next/server";
import { formFile, readFormData } from "@/lib/route-helpers";

const ALLOWED_CSV_TYPES = new Set(["text/csv", "text/plain", "application/csv"]);

/** Reads the uploaded `file` form field as text, or returns the 400 to send back. */
export async function readCsvUpload(req: Request): Promise<{ text: string } | { error: NextResponse }> {
  const body = await readFormData(req);
  if ("error" in body) return body;
  const file = formFile(body.form, "file");
  if (!file) return { error: NextResponse.json({ error: "No file provided." }, { status: 400 }) };
  // Accept either a CSV MIME type or a .csv extension (browsers disagree on the type).
  if (!ALLOWED_CSV_TYPES.has(file.type) && !file.name.toLowerCase().endsWith(".csv")) {
    return { error: NextResponse.json({ error: "Only CSV files are accepted." }, { status: 400 }) };
  }
  return { text: await file.text() };
}
