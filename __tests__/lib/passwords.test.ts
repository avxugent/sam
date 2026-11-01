import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { BCRYPT_COST, hashPassword } from "@/lib/passwords";

describe("hashPassword", () => {
  it("hashes at cost 13 and the hash verifies", async () => {
    expect(BCRYPT_COST).toBe(13);
    const hash = await hashPassword("correct horse");
    expect(bcrypt.getRounds(hash)).toBe(13);
    expect(await bcrypt.compare("correct horse", hash)).toBe(true);
  }, 20_000);
});
