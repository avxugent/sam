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

const mergeRequestSchema = z.object({ targetId: z.string().min(1) });

/**
 * Shared prelude of the "merge X into Y" routes: reads `{ targetId }`, refuses
 * a self-merge and loads both records, or returns the 400/404 to send back.
 * `noun` is used in messages ("Cannot merge a model into itself.").
 */
export async function readMergeRequest<T>(
  req: Request,
  sourceId: string,
  noun: { article: "a" | "an"; name: string },
  load: (id: string) => Promise<T | null>
): Promise<{ source: T; target: T; targetId: string } | { error: Response }> {
  const parsed = mergeRequestSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) return { error: invalidInput(parsed.error) };
  const { targetId } = parsed.data;

  if (sourceId === targetId) {
    return { error: NextResponse.json({ error: `Cannot merge ${noun.article} ${noun.name} into itself.` }, { status: 400 }) };
  }
  const [source, target] = await Promise.all([load(sourceId), load(targetId)]);
  if (!source) return { error: NextResponse.json({ error: `Source ${noun.name} not found.` }, { status: 404 }) };
  if (!target) return { error: NextResponse.json({ error: `Target ${noun.name} not found.` }, { status: 404 }) };
  return { source, target, targetId };
}
