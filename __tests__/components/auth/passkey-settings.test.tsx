import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/two-factor/enrollment-client", () => ({ registerPasskey: vi.fn() }));

import { registerPasskey } from "@/lib/two-factor/enrollment-client";
import { PasskeySettings, type PasskeySummary } from "@/components/auth/passkey-settings";

const KEY: PasskeySummary = { id: "pk1", label: "YubiKey", deviceType: "singleDevice", backedUp: false, createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: null };
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PasskeySettings", () => {
  it("renders nothing for SSO accounts", () => {
    const { container } = render(<PasskeySettings provider="microsoft-entra-id" passkeys={[KEY]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("registers a passkey with the given label", async () => {
    vi.mocked(registerPasskey).mockResolvedValue({ ok: true });
    render(<PasskeySettings provider="credentials" passkeys={[]} />);
    expect(screen.getByText("passkeyNone")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /passkeyAdd/ }));
    await userEvent.type(screen.getByLabelText("passkeyLabel"), "Laptop");
    await userEvent.click(screen.getAllByRole("button", { name: /passkeyAdd/ }).at(-1)!);
    expect(registerPasskey).toHaveBeenCalledWith("Laptop");
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("explains a cancelled browser prompt", async () => {
    vi.mocked(registerPasskey).mockResolvedValue({ ok: false, cancelled: true, error: "NotAllowedError" });
    render(<PasskeySettings provider="credentials" passkeys={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /passkeyAdd/ }));
    await userEvent.click(screen.getAllByRole("button", { name: /passkeyAdd/ }).at(-1)!);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "passkeyCancelled" })));
  });

  it("removes a passkey after confirmation", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    render(<PasskeySettings provider="credentials" passkeys={[KEY]} />);
    await userEvent.click(screen.getByRole("button", { name: "passkeyRemove YubiKey" }));
    await userEvent.click(screen.getByRole("button", { name: "passkeyRemove" }));
    await waitFor(() => expect(screen.queryByText("YubiKey")).not.toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/passkey/pk1", { method: "DELETE" });
  });

  it("keeps the passkey and shows the error when removal fails", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Cannot remove your last second factor." }), { status: 400 }));
    render(<PasskeySettings provider="credentials" passkeys={[KEY]} />);
    await userEvent.click(screen.getByRole("button", { name: "passkeyRemove YubiKey" }));
    await userEvent.click(screen.getByRole("button", { name: "passkeyRemove" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Cannot remove your last second factor." })));
    expect(screen.getByText("YubiKey")).toBeInTheDocument();
  });
});
