import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: vi.fn() }));

import { TwoFactorChallenge } from "@/components/auth/two-factor-challenge";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

beforeEach(() => {
  vi.clearAllMocks();
});

async function submitCode() {
  render(<TwoFactorChallenge />);
  await userEvent.type(screen.getByLabelText("twoFactorCode"), "123456");
  await userEvent.click(screen.getByRole("button", { name: "twoFactorVerify" }));
}

describe("TwoFactorChallenge", () => {
  it("shows the API error for a wrong code", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid code." }), { status: 401 }));
    await submitCode();
    expect(await screen.findByText("Invalid code.")).toBeInTheDocument();
  });

  it("recovers from a server error without a JSON body", async () => {
    mockFetch.mockResolvedValueOnce(new Response("upstream down", { status: 502 }));
    await submitCode();
    expect(await screen.findByText("verificationFailed")).toBeInTheDocument();
    expect(screen.getByLabelText("twoFactorCode")).toHaveValue("");
  });
});
