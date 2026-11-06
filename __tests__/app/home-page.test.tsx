import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { count: vi.fn() } } }));

import HomePage from "@/app/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { session } from "./helpers";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("home page", () => {
  it("sends a signed-in user to /locations without counting users", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    await expect(HomePage()).rejects.toThrow("REDIRECT:/locations");
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it("sends a visitor to /setup when no users exist", async () => {
    mockAuth.mockResolvedValue(null as never);
    vi.mocked(prisma.user.count).mockResolvedValue(0 as never);
    await expect(HomePage()).rejects.toThrow("REDIRECT:/setup");
  });

  it("sends a visitor to /login once a user exists", async () => {
    mockAuth.mockResolvedValue(null as never);
    vi.mocked(prisma.user.count).mockResolvedValue(1 as never);
    await expect(HomePage()).rejects.toThrow("REDIRECT:/login");
  });
});
