import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() }, apiKey: { findMany: vi.fn() } } }));
vi.mock("@/components/settings/profile-client", () => ({ ProfileClient: vi.fn(() => null) }));
vi.mock("@/components/settings/api-keys-settings", () => ({ ApiKeysSettings: vi.fn(() => null) }));

import ProfilePage, { generateMetadata } from "@/app/(dashboard)/settings/profile/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileClient } from "@/components/settings/profile-client";
import { ApiKeysSettings } from "@/components/settings/api-keys-settings";
import { propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("settings/profile page", () => {
  it("titles the page", async () => {
    expect(await generateMetadata()).toEqual({ title: "profileTitle" });
  });

  it("redirects an unauthenticated visitor to /login", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(ProfilePage()).rejects.toThrow("REDIRECT:/login");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("redirects to /login when the session's user no longer exists", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    await expect(ProfilePage()).rejects.toThrow("REDIRECT:/login");
  });

  it("passes the signed-in user's own profile to the client", async () => {
    mockAuth.mockResolvedValue(session("VIEWER", "u3") as never);
    const user = { name: "Jane", email: "jane@example.com", provider: "microsoft-entra-id", locationDefaultTab: "assets" };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([
      { id: "k1", label: "Claude", keyPrefix: "sam_mcp_abcd", createdAt: new Date("2026-01-01T00:00:00Z"), lastUsedAt: null, expiresAt: new Date("2027-01-01T00:00:00Z") },
    ] as never);

    await renderPage(ProfilePage());

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u3" },
      select: { name: true, email: true, provider: true, locationDefaultTab: true },
    });
    expect(propsOf(ProfileClient)).toEqual(user);
    expect(vi.mocked(prisma.apiKey.findMany).mock.calls[0][0]!.where).toEqual({ userId: "u3" });
    expect(propsOf(ApiKeysSettings)).toEqual({
      keys: [
        { id: "k1", label: "Claude", keyPrefix: "sam_mcp_abcd", createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: null, expiresAt: "2027-01-01T00:00:00.000Z" },
      ],
    });
  });
});
