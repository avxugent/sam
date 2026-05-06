import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const messages = require("../../messages/en.json") as Record<string, Record<string, string>>;
    const section = messages[ns] ?? {};
    return (key: string) => section[key] ?? key;
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { AssetFormDialog } from "@/components/assets/asset-form-dialog";

function renderDialog() {
  return render(
    <AssetFormDialog mode="create" locationId="loc-1">
      <button>Open</button>
    </AssetFormDialog>
  );
}

async function openDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  return user;
}

describe("<AssetFormDialog /> validation", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // By default, return empty lists for dropdowns
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/asset-types")) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }
      if (url.includes("/api/manufacturers")) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    });
  });

  it("shows Type required error on submit without selecting type", async () => {
    renderDialog();
    const user = await openDialog();
    // Click submit without filling in required fields
    const submitBtn = screen.getByRole("button", { name: "Create asset" });
    await user.click(submitBtn);
    await waitFor(() => {
      expect(screen.getByText("Type is required")).toBeInTheDocument();
    });
  });

  it("shows Model required error", async () => {
    renderDialog();
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "Create asset" }));
    await waitFor(() => {
      expect(screen.getByText("Model is required")).toBeInTheDocument();
    });
  });

  it("shows FQDN validation error for invalid hostname", async () => {
    renderDialog();
    const user = await openDialog();

    const hostnameInput = screen.getByPlaceholderText(/device\.example\.com/i);
    await user.type(hostnameInput, "not-a-fqdn");

    await user.click(screen.getByRole("button", { name: "Create asset" }));

    await waitFor(() => {
      expect(
        screen.getByText(/fully qualified domain name/i)
      ).toBeInTheDocument();
    });
  });

  it("does not show FQDN error for a valid FQDN", async () => {
    renderDialog();
    const user = await openDialog();

    const hostnameInput = screen.getByPlaceholderText(/device\.example\.com/i);
    await user.type(hostnameInput, "projector.ugent.be");
    // Trigger validation by submitting (other required fields will fail, but FQDN should not)
    await user.click(screen.getByRole("button", { name: "Create asset" }));

    await waitFor(() => {
      // The destructive error for FQDN should not be present (only the persistent hint text is)
      const allText = document.body.textContent ?? "";
      // The error class only appears after failed validation of an invalid hostname
      // With a valid FQDN, no "Hostname must be" error text should appear
      expect(allText).not.toMatch(/Hostname must be a fully qualified/i);
    });
  });

  it("shows 'MAC required' error when hostname is set but no MAC added", async () => {
    renderDialog();
    const user = await openDialog();

    const hostnameInput = screen.getByPlaceholderText(/device\.example\.com/i);
    await user.type(hostnameInput, "projector.ugent.be");

    await user.click(screen.getByRole("button", { name: "Create asset" }));

    await waitFor(() => {
      expect(
        screen.getByText(/At least one MAC address is required when a hostname is set/i)
      ).toBeInTheDocument();
    });
  });

  it("shows MAC format error for invalid MAC address", async () => {
    renderDialog();
    const user = await openDialog();

    // Add a MAC address field
    await user.click(screen.getByRole("button", { name: /Add MAC/i }));

    const macInput = screen.getByPlaceholderText("AA:BB:CC:DD:EE:FF");
    await user.type(macInput, "not-a-mac");

    await user.click(screen.getByRole("button", { name: "Create asset" }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid MAC address/i)).toBeInTheDocument();
    });
  });

  it("allows hostname+MAC combination without errors", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/asset-types")) return Promise.resolve({ ok: true, json: async () => [{ id: "t1", name: "Projector" }] } as Response);
      if (url.includes("/api/manufacturers")) return Promise.resolve({ ok: true, json: async () => [{ id: "m1", name: "Epson" }] } as Response);
      if (url.includes("/api/locations") && url.includes("/assets")) return Promise.resolve({ ok: true, json: async () => ({ id: "asset-1" }) } as Response);
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    });

    renderDialog();
    const user = await openDialog();

    // Type a valid hostname
    await user.type(
      screen.getByPlaceholderText(/device\.example\.com/i),
      "projector.ugent.be"
    );

    // Add a valid MAC
    await user.click(screen.getByRole("button", { name: /Add MAC/i }));
    await user.type(screen.getByPlaceholderText("AA:BB:CC:DD:EE:FF"), "AA:BB:CC:DD:EE:FF");

    // Fill model
    await user.type(screen.getByPlaceholderText(/Epson EB-W06/i), "EB-W06");

    await user.click(screen.getByRole("button", { name: "Create asset" }));

    // With Type and Manufacturer still empty, we'll get those errors not MAC errors
    await waitFor(() => {
      expect(screen.queryByText(/At least one MAC address/i)).not.toBeInTheDocument();
    });
  });

  it("shows the Vault section with a Test button", async () => {
    renderDialog();
    await openDialog();
    expect(screen.getByText(/Vault Credentials/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test" })).toBeInTheDocument();
  });
});
