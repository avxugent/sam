import { describe, it, expect } from "vitest";
import en from "@/messages/en.json";
import nl from "@/messages/nl.json";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}

describe("translation catalogs", () => {
  it("en and nl define exactly the same keys", () => {
    const enKeys = new Set(keys(en));
    const nlKeys = new Set(keys(nl));
    expect([...enKeys].filter((k) => !nlKeys.has(k))).toEqual([]);
    expect([...nlKeys].filter((k) => !enKeys.has(k))).toEqual([]);
  });
});
