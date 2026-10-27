import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));

import { auth } from "@/lib/auth";
import AdminPage from "@/app/(dashboard)/admin/page";

const mockAuth = vi.mocked(auth);

describe("/admin index", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["ADMIN", "/admin/users"],
    ["MAINTAINER", "/admin/manufacturers"],
    ["EDITOR", "/"],
    ["VIEWER", "/"],
  ])("redirects %s to %s", async (role, target) => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role } } as never);
    await expect(AdminPage()).rejects.toThrow(`REDIRECT:${target}`);
  });
});
