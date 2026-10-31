import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findMany: vi.fn() } } }));
vi.mock("@/components/admin/users-client", () => ({ UsersClient: vi.fn(() => null) }));

import UsersPage from "@/app/(dashboard)/admin/users/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { UsersClient } from "@/components/admin/users-client";
import { NON_ADMIN_ROLES, propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin/users page", () => {
  it("redirects an unauthenticated visitor to / without querying users", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(UsersPage()).rejects.toThrow("REDIRECT:/");
    expect(redirect).toHaveBeenCalledWith("/");
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it.each(NON_ADMIN_ROLES)("redirects a %s to / without querying users", async (role) => {
    mockAuth.mockResolvedValue(session(role) as never);
    await expect(UsersPage()).rejects.toThrow("REDIRECT:/");
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(UsersClient).not.toHaveBeenCalled();
  });

  it("passes the users and the current user id to the client for an admin", async () => {
    mockAuth.mockResolvedValue(session("ADMIN", "admin-1") as never);
    const users = [{ id: "u1", name: "Alice", email: "a@example.com", role: "VIEWER" }];
    vi.mocked(prisma.user.findMany).mockResolvedValue(users as never);

    await renderPage(UsersPage());

    expect(propsOf(UsersClient)).toEqual({ initialUsers: users, currentUserId: "admin-1" });
    // Never select the password hash or TOTP secret for the client.
    const select = vi.mocked(prisma.user.findMany).mock.calls[0][0]!.select!;
    expect(select).not.toHaveProperty("passwordHash");
    expect(select).not.toHaveProperty("totpSecret");
  });
});
