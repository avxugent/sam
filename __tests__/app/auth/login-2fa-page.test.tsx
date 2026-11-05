import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth", () => ({ authIncludingPendingSteps: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { passkey: { count: vi.fn() } } }));
vi.mock("@/components/auth/two-factor-challenge", () => ({ TwoFactorChallenge: vi.fn(() => null) }));

import TwoFactorPage, { generateMetadata } from "@/app/(auth)/login/2fa/page";
import { authIncludingPendingSteps } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TwoFactorChallenge } from "@/components/auth/two-factor-challenge";
import { propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(authIncludingPendingSteps);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("login/2fa page", () => {
  it("titles the page", async () => {
    expect(await generateMetadata()).toEqual({ title: "twoFactorTitle" });
  });

  it("offers no passkey and skips the lookup without a session", async () => {
    mockAuth.mockResolvedValue(null as never);
    await renderPage(TwoFactorPage());
    expect(prisma.passkey.count).not.toHaveBeenCalled();
    expect(propsOf(TwoFactorChallenge).hasPasskey).toBe(false);
  });

  it("offers a passkey when the pending user has one", async () => {
    mockAuth.mockResolvedValue(session("VIEWER", "u2") as never);
    vi.mocked(prisma.passkey.count).mockResolvedValue(2 as never);
    await renderPage(TwoFactorPage());
    expect(prisma.passkey.count).toHaveBeenCalledWith({ where: { userId: "u2" } });
    expect(propsOf(TwoFactorChallenge).hasPasskey).toBe(true);
  });

  it("offers no passkey when the pending user has none", async () => {
    mockAuth.mockResolvedValue(session("VIEWER", "u2") as never);
    vi.mocked(prisma.passkey.count).mockResolvedValue(0 as never);
    await renderPage(TwoFactorPage());
    expect(propsOf(TwoFactorChallenge).hasPasskey).toBe(false);
  });
});
