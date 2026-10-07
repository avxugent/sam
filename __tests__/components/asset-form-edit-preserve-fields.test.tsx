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
    return (key: string, params?: Record<string, string | number>) => {
      const template = section[key] ?? key;
      if (!params) return template;
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
        template
      );
    };
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { AssetFormDialog } from "@/components/assets/asset-form-dialog";

// A fully populated asset, so we can assert that editing one field doesn't
// silently drop the rest — in particular the fields backed by a Radix
// <Select> (type, owner, supplier, criticality), which is where the bug was.
const asset = {
  id: "asset-1",
  typeId: "t1",
  manufacturerId: "m1",
  modelId: "mo1",
  serialNumber: "SN123",
  hostname: "",
  installationDate: null,
  invoiceNumber: "",
  invoiceDate: null,
  notes: "important notes",
  vaultPath: "",
  ownerId: "u1",
  criticality: "HIGH",
  endOfSupportDate: null,
  supplierId: "sup1",
  macAddresses: [],
  customFields: [],
};

let putBody: Record<string, unknown> | null;

function setupFetchMock() {
  putBody = null;
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
    if (url.includes("/api/asset-types")) {
      return Promise.resolve({
        ok: true,
        json: async () => [
          { id: "t1", name: "Projector" },
          { id: "t2", name: "Screen" },
        ],
      } as Response);
    }
    if (url.includes("/api/manufacturers")) {
      return Promise.resolve({
        ok: true,
        json: async () => [
          { id: "m1", name: "Epson" },
          { id: "m2", name: "Sony" },
        ],
      } as Response);
    }
    if (url.includes("/api/suppliers")) {
      return Promise.resolve({
        ok: true,
        json: async () => [{ id: "sup1", name: "AV Supplies", defaultFrom: null, defaultUntil: null }],
      } as Response);
    }
    if (url.includes("/api/users/lite")) {
      return Promise.resolve({
        ok: true,
        json: async () => [
          { id: "u1", name: "Alice" },
          { id: "u2", name: "Bob" },
        ],
      } as Response);
    }
    if (url.startsWith("/api/models")) {
      return Promise.resolve({
        ok: true,
        json: async () => [{ id: "mo1", name: "EB-W06", typeId: "t1", manufacturerId: "m1" }],
      } as Response);
    }
    if (url === "/api/assets/asset-1" && (!opts || opts.method === undefined)) {
      return Promise.resolve({ ok: true, json: async () => asset } as Response);
    }
    if (url === "/api/assets/asset-1" && opts?.method === "PUT") {
      putBody = JSON.parse(opts.body as string);
      return Promise.resolve({ ok: true, json: async () => ({ ...asset }) } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => [] } as Response);
  });
}

async function openEditDialog() {
  render(
    <AssetFormDialog mode="edit" locationId="loc-1" assetId="asset-1">
      <button>Open</button>
    </AssetFormDialog>
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  await waitFor(() => {
    expect((screen.getByPlaceholderText(/Epson EB-W06/i) as HTMLInputElement).value).toBe("EB-W06");
  });
  return user;
}

describe("<AssetFormDialog /> edit mode preserves existing fields", () => {
  beforeEach(setupFetchMock);

  it("keeps owner, type, criticality and supplier when only the manufacturer is changed", async () => {
    const user = await openEditDialog();

    const mfrInput = screen.getByPlaceholderText(/select manufacturer/i);
    await user.clear(mfrInput);
    await user.type(mfrInput, "Sony");
    await waitFor(() => screen.getByText("Sony"));
    await user.click(screen.getByText("Sony"));

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(putBody).not.toBeNull());

    expect(putBody!.manufacturerId).toBe("m2");
    expect(putBody!.typeId).toBe("t1");
    expect(putBody!.ownerId).toBe("u1");
    expect(putBody!.criticality).toBe("HIGH");
    expect(putBody!.supplierId).toBe("sup1");
    expect(putBody!.notes).toBe("important notes");
    expect(putBody!.serialNumber).toBe("SN123");
  });

  it("keeps owner, type, criticality and supplier when saving without changing anything", async () => {
    const user = await openEditDialog();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(putBody).not.toBeNull());

    expect(putBody!.typeId).toBe("t1");
    expect(putBody!.manufacturerId).toBe("m1");
    expect(putBody!.ownerId).toBe("u1");
    expect(putBody!.criticality).toBe("HIGH");
    expect(putBody!.supplierId).toBe("sup1");
  });

  it("still allows explicitly clearing the owner back to the default", async () => {
    const user = await openEditDialog();

    await user.click(screen.getByRole("combobox", { name: /owner/i }));
    await user.click(await screen.findByRole("option", { name: "Default owner" }));

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(putBody).not.toBeNull());

    expect(putBody!.ownerId).toBeNull();
    // Unrelated fields must still survive the explicit owner clear.
    expect(putBody!.typeId).toBe("t1");
    expect(putBody!.criticality).toBe("HIGH");
  });
});
