import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import AdminPage from "@/app/(dashboard)/admin/page";
import { auth } from "@/lib/auth";
import { session } from "../helpers";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin index page", () => {
  it.each([
    [null, "/"],
    [session("VIEWER"), "/"],
    [session("EDITOR"), "/"],
    [session("MAINTAINER"), "/admin/manufacturers"],
    [session("ADMIN"), "/admin/users"],
  ])("redirects %j to %s", async (s, target) => {
    mockAuth.mockResolvedValue(s as never);
    await expect(AdminPage()).rejects.toThrow(new Error(`REDIRECT:${target}`));
  });
});
