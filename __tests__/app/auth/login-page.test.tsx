import { describe, it, expect, vi, beforeEach } from "vitest";

const authState = vi.hoisted(() => ({ ssoEnabled: false }));

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth", () => ({
  get ssoEnabled() {
    return authState.ssoEnabled;
  },
}));
vi.mock("@/components/auth/login-client", () => ({ LoginClient: vi.fn(() => null) }));

import LoginPage, { generateMetadata } from "@/app/(auth)/login/page";
import { getTranslations } from "next-intl/server";
import { LoginClient } from "@/components/auth/login-client";
import { render } from "@testing-library/react";
import { propsOf } from "../helpers";

beforeEach(() => {
  vi.clearAllMocks();
  authState.ssoEnabled = false;
});

describe("login page", () => {
  it("titles the page from the auth namespace", async () => {
    expect(await generateMetadata()).toEqual({ title: "signInHeading" });
    expect(getTranslations).toHaveBeenCalledWith("auth");
  });

  it("passes SSO off to the client", () => {
    render(LoginPage());
    expect(propsOf(LoginClient)).toEqual({ ssoEnabled: false });
  });

  it("reports SSO when enabled", () => {
    authState.ssoEnabled = true;
    render(LoginPage());
    expect(propsOf(LoginClient)).toEqual({ ssoEnabled: true });
  });
});
