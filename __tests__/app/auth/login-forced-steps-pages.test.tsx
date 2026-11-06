import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/components/auth/forced-password-change-client", () => ({ ForcedPasswordChangeClient: vi.fn(() => null) }));
vi.mock("@/components/auth/forced-2fa-setup-client", () => ({ Forced2FASetupClient: vi.fn(() => null) }));

import ChangePasswordPage, { generateMetadata as changePasswordMetadata } from "@/app/(auth)/login/change-password/page";
import Setup2FAPage, { generateMetadata as setup2faMetadata } from "@/app/(auth)/login/setup-2fa/page";
import { getTranslations } from "next-intl/server";
import { ForcedPasswordChangeClient } from "@/components/auth/forced-password-change-client";
import { Forced2FASetupClient } from "@/components/auth/forced-2fa-setup-client";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("login/change-password page", () => {
  it("renders the forced password change client", () => {
    render(<ChangePasswordPage />);
    expect(ForcedPasswordChangeClient).toHaveBeenCalled();
  });

  it("titles the page from the auth namespace", async () => {
    expect(await changePasswordMetadata()).toEqual({ title: "passwordChangeTitle" });
    expect(getTranslations).toHaveBeenCalledWith("auth");
  });
});

describe("login/setup-2fa page", () => {
  it("renders the forced 2FA setup client", () => {
    render(<Setup2FAPage />);
    expect(Forced2FASetupClient).toHaveBeenCalled();
  });

  it("titles the page from the auth namespace", async () => {
    expect(await setup2faMetadata()).toEqual({ title: "twoFactorSetupTitle" });
  });
});
