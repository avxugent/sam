import { prisma } from "@/lib/prisma";

/** Key/value pairs from the AppSetting table; missing keys are absent from the result. */
export async function readSettings(keys: readonly string[]): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: [...keys] } } });
  return Object.fromEntries(rows.map((s) => [s.key, s.value]));
}

/**
 * Upserts every entry whose value is defined (undefined = "not part of this
 * update") and returns what was written, ready for an audit `detail`.
 */
export async function writeSettings(entries: Record<string, string | undefined>): Promise<Record<string, string>> {
  const written = Object.fromEntries(
    Object.entries(entries).filter((e): e is [string, string] => e[1] !== undefined)
  );
  await Promise.all(
    Object.entries(written).map(([key, value]) =>
      prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
    )
  );
  return written;
}
