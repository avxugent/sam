import { describe, it, expect, vi, beforeEach } from "vitest";

const authState = vi.hoisted(() => ({ ssoEnabled: false }));

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth", () => ({
  get ssoEnabled() {
    return authState.ssoEnabled;
  },
}));
vi.mock("@/lib/app-settings", () => ({ readBrandingSettings: vi.fn() }));
vi.mock("@/components/auth/login-client", () => ({ LoginClient: vi.fn(() => null) }));

import LoginPage, { generateMetadata } from "@/app/(auth)/login/page";
import { getTranslations } from "next-intl/server";
import { readBrandingSettings } from "@/lib/app-settings";
import { LoginClient } from "@/components/auth/login-client";
import { propsOf, renderPage } from "../helpers";

beforeEach(() => {
  vi.clearAllMocks();
  authState.ssoEnabled = false;
});

describe("login page", () => {
  it("titles the page from the auth namespace", async () => {
    expect(await generateMetadata()).toEqual({ title: "signInHeading" });
    expect(getTranslations).toHaveBeenCalledWith("auth");
  });

  it("passes the branding logo and title, with SSO off", async () => {
    vi.mocked(readBrandingSettings).mockResolvedValue({ appTitle: "Inventory", hasLogo: true } as never);
    await renderPage(LoginPage());
    expect(propsOf(LoginClient)).toEqual({ ssoEnabled: false, appTitle: "Inventory", logoUrl: "/api/branding/logo" });
  });

  it("passes no logo URL without a logo and reports SSO when enabled", async () => {
    authState.ssoEnabled = true;
    vi.mocked(readBrandingSettings).mockResolvedValue({ appTitle: "SAM", hasLogo: false } as never);
    await renderPage(LoginPage());
    expect(propsOf(LoginClient)).toEqual({ ssoEnabled: true, appTitle: "SAM", logoUrl: null });
  });
});
