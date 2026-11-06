import { describe, it, expect } from "vitest";
import { canEdit, canManageCatalog, canModifyWorkLog, isAdmin, Role } from "@/lib/permissions";

// Expected access per role, mirroring the role hierarchy ADMIN > MAINTAINER > EDITOR > VIEWER.
const matrix: { role: Role; isAdmin: boolean; canManageCatalog: boolean; canEdit: boolean }[] = [
  { role: "ADMIN", isAdmin: true, canManageCatalog: true, canEdit: true },
  { role: "MAINTAINER", isAdmin: false, canManageCatalog: true, canEdit: true },
  { role: "EDITOR", isAdmin: false, canManageCatalog: false, canEdit: true },
  { role: "VIEWER", isAdmin: false, canManageCatalog: false, canEdit: false },
];

describe.each(matrix)("$role", (row) => {
  it(`isAdmin() is ${row.isAdmin}`, () => {
    expect(isAdmin(row.role)).toBe(row.isAdmin);
  });

  it(`canManageCatalog() is ${row.canManageCatalog}`, () => {
    expect(canManageCatalog(row.role)).toBe(row.canManageCatalog);
  });

  it(`canEdit() is ${row.canEdit}`, () => {
    expect(canEdit(row.role)).toBe(row.canEdit);
  });
});

describe("missing role", () => {
  it.each([undefined, null])("denies everything for %s", (role) => {
    expect(isAdmin(role)).toBe(false);
    expect(canManageCatalog(role)).toBe(false);
    expect(canEdit(role)).toBe(false);
  });
});

it("covers every Prisma Role value", () => {
  expect(matrix.map((r) => r.role).sort()).toEqual(Object.values(Role).sort());
});

describe("canModifyWorkLog()", () => {
  it("lets writers modify their own entries and admins any entry", () => {
    expect(canModifyWorkLog("EDITOR", "u1", "u1")).toBe(true);
    expect(canModifyWorkLog("EDITOR", "u1", "u2")).toBe(false);
    expect(canModifyWorkLog("MAINTAINER", "u1", "u2")).toBe(false);
    expect(canModifyWorkLog("ADMIN", "u1", "u2")).toBe(true);
  });

  it("denies a viewer, even as the entry's performer", () => {
    expect(canModifyWorkLog("VIEWER", "u1", "u1")).toBe(false);
    expect(canModifyWorkLog(undefined, "u1", "u1")).toBe(false);
  });
});
