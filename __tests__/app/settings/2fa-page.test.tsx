import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() }, passkey: { findMany: vi.fn() } },
}));
vi.mock("@/components/auth/two-factor-settings", () => ({ TwoFactorSettings: vi.fn(() => null) }));
vi.mock("@/components/auth/passkey-settings", () => ({ PasskeySettings: vi.fn(() => null) }));

import TwoFactorSettingsPage, { generateMetadata } from "@/app/(dashboard)/settings/2fa/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TwoFactorSettings } from "@/components/auth/two-factor-settings";
import { PasskeySettings } from "@/components/auth/passkey-settings";
import { propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.passkey.findMany).mockResolvedValue([] as never);
});

describe("settings/2fa page", () => {
  it("titles the page", async () => {
    expect(await generateMetadata()).toEqual({ title: "twoFactorPageTitle" });
  });

  it("redirects an unauthenticated visitor to /login", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(TwoFactorSettingsPage()).rejects.toThrow("REDIRECT:/login");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("redirects to /login when the session's user no longer exists", async () => {
    mockAuth.mockResolvedValue(session("VIEWER", "gone") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    await expect(TwoFactorSettingsPage()).rejects.toThrow("REDIRECT:/login");
    expect(prisma.passkey.findMany).not.toHaveBeenCalled();
  });

  it("loads the signed-in user's own 2FA state and passkeys with ISO dates", async () => {
    mockAuth.mockResolvedValue(session("VIEWER", "u7") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ provider: "credentials", totpEnabled: true } as never);
    vi.mocked(prisma.passkey.findMany).mockResolvedValue([
      { id: "p1", label: "Key", deviceType: "singleDevice", backedUp: false, createdAt: new Date("2026-01-01T00:00:00.000Z"), lastUsedAt: null },
      { id: "p2", label: "Phone", deviceType: "multiDevice", backedUp: true, createdAt: new Date("2026-02-01T00:00:00.000Z"), lastUsedAt: new Date("2026-03-01T00:00:00.000Z") },
    ] as never);

    await renderPage(TwoFactorSettingsPage());

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "u7" }, select: { provider: true, totpEnabled: true } });
    expect(vi.mocked(prisma.passkey.findMany).mock.calls[0][0]).toMatchObject({ where: { userId: "u7" }, orderBy: { createdAt: "asc" } });
    expect(propsOf(TwoFactorSettings)).toEqual({ provider: "credentials", totpEnabled: true });
    expect(propsOf(PasskeySettings)).toEqual({
      provider: "credentials",
      totpEnabled: true,
      passkeys: [
        { id: "p1", label: "Key", deviceType: "singleDevice", backedUp: false, createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: null },
        { id: "p2", label: "Phone", deviceType: "multiDevice", backedUp: true, createdAt: "2026-02-01T00:00:00.000Z", lastUsedAt: "2026-03-01T00:00:00.000Z" },
      ],
    });
  });
});
