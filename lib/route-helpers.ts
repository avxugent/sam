import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Small shared building blocks for API route handlers, so every route reports
 * malformed bodies, validation failures and unique-constraint conflicts the
 * same way.
 */

/**
 * Reads a JSON request body. A missing or malformed body yields `null`, which
 * the caller's Zod schema then rejects with a 400 instead of the handler
 * throwing a 500.
 */
export async function readJsonBody(req: Request): Promise<unknown> {
  return req.json().catch(() => null);
}

/** Standard 400 for a failed Zod parse: `{ error, details }` with flattened field errors. */
export function invalidInput(error: z.ZodError, message = "Invalid input") {
  return NextResponse.json({ error: message, details: z.flattenError(error) }, { status: 400 });
}

/**
 * Whether a Prisma error is a unique-constraint violation (P2002). Checked
 * structurally rather than with `instanceof PrismaClientKnownRequestError`,
 * which breaks across duplicated client bundles.
 */
export function isUniqueConstraintError(err: unknown): boolean {
  return hasPrismaCode(err, "P2002");
}

/** Whether a Prisma update/delete targeted a row that does not exist (P2025). */
export function isRecordNotFoundError(err: unknown): boolean {
  return hasPrismaCode(err, "P2025");
}

export function isForeignKeyError(err: unknown): boolean {
  return hasPrismaCode(err, "P2003");
}

/** 404 for the record named in the URL path, e.g. notFoundResponse("Model") -> "Model not found." */
export function notFoundResponse(what?: string): NextResponse {
  return NextResponse.json({ error: what ? `${what} not found.` : "Not found." }, { status: 404 });
}

/** 409 for a create or rename onto a name that is already taken (unique constraint). */
export function nameTakenResponse(message = "Name already exists."): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 });
}

/**
 * 400 for an id in the request body that names no record (a stale location,
 * type, model, …). The record in the URL path is the 404 case; a body
 * reference is invalid input.
 */
export function unknownReferenceResponse(what = "A referenced record"): NextResponse {
  return NextResponse.json({ error: `${what} does not exist.`, code: "unknownReference" }, { status: 400 });
}

/** The Prisma error code (e.g. "P2002") of a known request error, or null. */
export function prismaErrorCode(err: unknown): string | null {
  return typeof err === "object" && err !== null && "code" in err && typeof err.code === "string" ? err.code : null;
}

function hasPrismaCode(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === code;
}

/** CSV file download response; never cached, since exports reflect live data. */
export function csvDownload(csv: string, filename: string) {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
