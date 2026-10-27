import { describe, it, expect } from "vitest";
import { canEdit, canManageCatalog, isAdmin, Role } from "@/lib/permissions";

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
