import { describe, it, expect } from "vitest";
import { createWorkLogItemSchema, updateWorkLogItemSchema } from "@/lib/work-log-item-schema";
import { createWorkLogSchema } from "@/lib/work-log-schema";

describe("createWorkLogItemSchema", () => {
  it("accepts a name with optional description", () => {
    expect(createWorkLogItemSchema.safeParse({ name: "Review asset list" }).success).toBe(true);
    expect(createWorkLogItemSchema.safeParse({ name: "X", description: "note" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(createWorkLogItemSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects an over-long name", () => {
    expect(createWorkLogItemSchema.safeParse({ name: "a".repeat(121) }).success).toBe(false);
  });

  it("update schema allows a partial payload", () => {
    expect(updateWorkLogItemSchema.safeParse({}).success).toBe(true);
    expect(updateWorkLogItemSchema.safeParse({ description: null }).success).toBe(true);
  });
});

describe("createWorkLogSchema item/description cross-field", () => {
  it("accepts an item with no description", () => {
    expect(createWorkLogSchema.safeParse({ itemId: "wi1" }).success).toBe(true);
  });

  it("accepts a description with no item", () => {
    expect(createWorkLogSchema.safeParse({ description: "did work" }).success).toBe(true);
  });

  it("rejects neither item nor description", () => {
    const r = createWorkLogSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects an empty-string description with no item", () => {
    expect(createWorkLogSchema.safeParse({ description: "" }).success).toBe(false);
  });
});
