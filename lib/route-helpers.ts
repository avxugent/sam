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

function hasPrismaCode(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === code;
}
