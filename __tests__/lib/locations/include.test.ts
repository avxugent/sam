import { describe, it, expect } from "vitest";
import { LOCATION_DETAIL_INCLUDE, LOCATION_PAGE_INCLUDE } from "@/lib/locations/include";

describe("LOCATION_DETAIL_INCLUDE", () => {
  it("selects only id, name and parentId of the parent", () => {
    expect(LOCATION_DETAIL_INCLUDE.parent).toEqual({ select: { id: true, name: true, parentId: true } });
  });

  it("includes children with asset/child counts, ordered by order then name", () => {
    expect(LOCATION_DETAIL_INCLUDE.children).toEqual({
      include: { _count: { select: { assets: true, children: true } } },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    });
  });

  it("counts assets, children and attachments of the location itself", () => {
    expect(LOCATION_DETAIL_INCLUDE._count).toEqual({ select: { assets: true, children: true, attachments: true } });
  });

  it("does not load attachments", () => {
    expect(LOCATION_DETAIL_INCLUDE).not.toHaveProperty("attachments");
  });
});

describe("LOCATION_PAGE_INCLUDE", () => {
  it("extends the detail include unchanged", () => {
    const { attachments, ...rest } = LOCATION_PAGE_INCLUDE;
    expect(rest).toEqual(LOCATION_DETAIL_INCLUDE);
    expect(attachments).toBeDefined();
  });

  it("loads attachments newest first, with the uploader's id and name only", () => {
    expect(LOCATION_PAGE_INCLUDE.attachments).toEqual({
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    expect(LOCATION_PAGE_INCLUDE.attachments.include.uploadedBy.select).not.toHaveProperty("passwordHash");
  });
});
