import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockToast, mockRefresh } = vi.hoisted(() => ({ mockToast: vi.fn(), mockRefresh: vi.fn() }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values?.names ? `${key}:${values.names}` : key,
}));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

import { SuppliersClient, type SupplierRow } from "@/components/admin/suppliers-client";

const ACME: SupplierRow = {
  id: "s1",
  name: "Acme",
  contractReference: "C-42",
  contactInfo: "acme@example.com",
  defaultFrom: "2026-01-15T12:00:00.000Z",
  defaultUntil: "2026-12-31T12:00:00.000Z",
  _count: { assets: 0 },
};
const ZETA: SupplierRow = {
  id: "s2",
  name: "Zeta",
  contractReference: null,
  contactInfo: null,
  defaultFrom: null,
  defaultUntil: null,
  _count: { assets: 3 },
};
const OPEN: SupplierRow = { ...ZETA, id: "s3", name: "Open", defaultFrom: "2026-03-01T12:00:00.000Z", _count: { assets: 0 } };

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const json = (body: unknown, ok = true, status = ok ? 200 : 400) => ({ ok, status, json: async () => body }) as Response;

const row = (name: string) => screen.getByText(name).closest("tr")!;
const names = () => screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SuppliersClient — list", () => {
  it("shows the empty state", () => {
    render(<SuppliersClient initialSuppliers={[]} />);
    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("renders contract, default window, open-ended window and asset counts", () => {
    render(<SuppliersClient initialSuppliers={[ACME, OPEN, ZETA]} />);
    expect(within(row("Acme")).getByText("C-42")).toBeInTheDocument();
    expect(within(row("Acme")).getByText("15 Jan 2026 → 31 Dec 2026")).toBeInTheDocument();
    expect(within(row("Open")).getByText("01 Mar 2026 → openEnded")).toBeInTheDocument();
    expect(within(row("Zeta")).getAllByText("—")).toHaveLength(2);
    expect(within(row("Zeta")).getByText("3")).toBeInTheDocument();
  });

  it("disables delete for a supplier that still has assets", () => {
    render(<SuppliersClient initialSuppliers={[ACME, ZETA]} />);
    expect(within(row("Zeta")).getByRole("button", { name: "delete" })).toBeDisabled();
    expect(within(row("Acme")).getByRole("button", { name: "delete" })).toBeEnabled();
  });
});

describe("SuppliersClient — create", () => {
  it("disables add for a blank name", async () => {
    render(<SuppliersClient initialSuppliers={[]} />);
    expect(screen.getByRole("button", { name: "addSupplier" })).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("namePlaceholder"), "   {Enter}");
    expect(screen.getByRole("button", { name: "addSupplier" })).toBeDisabled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("creates a supplier with the trimmed name and inserts it sorted", async () => {
    mockFetch.mockResolvedValueOnce(json({ ...ZETA, id: "s9", name: "Beta", _count: { assets: 0 } }));
    render(<SuppliersClient initialSuppliers={[ACME, ZETA]} />);
    const input = screen.getByPlaceholderText("namePlaceholder");
    await userEvent.type(input, "  Beta  ");
    await userEvent.click(screen.getByRole("button", { name: "addSupplier" }));

    expect(await screen.findByText("Beta")).toBeInTheDocument();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/suppliers");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "Beta" });
    expect(names()).toEqual(["Acme", "Beta", "Zeta"]);
    expect(input).toHaveValue("");
    expect(mockToast).toHaveBeenCalledWith({ title: "created" });
  });

  it("creates on Enter", async () => {
    mockFetch.mockResolvedValueOnce(json({ ...ZETA, id: "s9", name: "Gamma", _count: { assets: 0 } }));
    render(<SuppliersClient initialSuppliers={[]} />);
    await userEvent.type(screen.getByPlaceholderText("namePlaceholder"), "Gamma{Enter}");
    expect(await screen.findByText("Gamma")).toBeInTheDocument();
    expect(screen.queryByText("empty")).not.toBeInTheDocument();
  });

  it("toasts a duplicate-name conflict and keeps the typed name", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "A supplier with that name already exists" }, false, 409));
    render(<SuppliersClient initialSuppliers={[ACME]} />);
    const input = screen.getByPlaceholderText("namePlaceholder");
    await userEvent.type(input, "Acme");
    await userEvent.click(screen.getByRole("button", { name: "addSupplier" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({
        title: "error",
        description: "A supplier with that name already exists",
        variant: "destructive",
      })
    );
    expect(input).toHaveValue("Acme");
  });

  it("falls back to the generic error text for a body-less failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("offline"));
    render(<SuppliersClient initialSuppliers={[]} />);
    await userEvent.type(screen.getByPlaceholderText("namePlaceholder"), "X");
    await userEvent.click(screen.getByRole("button", { name: "addSupplier" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "error", variant: "destructive" })
    );
  });
});

describe("SuppliersClient — edit", () => {
  it("expands the editor prefilled from the row and collapses on a second click", async () => {
    render(<SuppliersClient initialSuppliers={[ACME, ZETA]} />);
    const toggle = within(row("Acme")).getByRole("button", { name: "edit" });
    await userEvent.click(toggle);
    expect(screen.getByLabelText("name")).toHaveValue("Acme");
    expect(screen.getByLabelText("contractReference")).toHaveValue("C-42");
    expect(screen.getByLabelText("contactInfo")).toHaveValue("acme@example.com");
    expect(screen.getByLabelText("defaultFrom")).toHaveValue("2026-01-15");
    expect(screen.getByLabelText("defaultUntil")).toHaveValue("2026-12-31");

    await userEvent.click(toggle);
    expect(screen.queryByLabelText("name")).not.toBeInTheDocument();
  });

  it("prefills empty fields for a supplier without optional data and cancels", async () => {
    render(<SuppliersClient initialSuppliers={[ZETA]} />);
    await userEvent.click(within(row("Zeta")).getByRole("button", { name: "edit" }));
    expect(screen.getByLabelText("contractReference")).toHaveValue("");
    expect(screen.getByLabelText("defaultFrom")).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(screen.queryByLabelText("name")).not.toBeInTheDocument();
  });

  it("switches the editor to another supplier", async () => {
    render(<SuppliersClient initialSuppliers={[ACME, ZETA]} />);
    await userEvent.click(within(row("Acme")).getByRole("button", { name: "edit" }));
    await userEvent.click(within(row("Zeta")).getByRole("button", { name: "edit" }));
    expect(screen.getByLabelText("name")).toHaveValue("Zeta");
  });

  it("disables save for a blank name", async () => {
    render(<SuppliersClient initialSuppliers={[ACME]} />);
    await userEvent.click(within(row("Acme")).getByRole("button", { name: "edit" }));
    await userEvent.clear(screen.getByLabelText("name"));
    await userEvent.type(screen.getByLabelText("name"), "  ");
    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
  });

  it("saves trimmed fields, sends blanks as null, re-sorts and refreshes", async () => {
    mockFetch.mockResolvedValueOnce(
      json({ id: "s1", name: "Zulu", contractReference: null, contactInfo: null, defaultFrom: null, defaultUntil: null })
    );
    render(<SuppliersClient initialSuppliers={[ACME, ZETA]} />);
    await userEvent.click(within(row("Acme")).getByRole("button", { name: "edit" }));
    const name = screen.getByLabelText("name");
    await userEvent.clear(name);
    await userEvent.type(name, " Zulu ");
    await userEvent.clear(screen.getByLabelText("contractReference"));
    await userEvent.type(screen.getByLabelText("contractReference"), "   ");
    await userEvent.clear(screen.getByLabelText("contactInfo"));
    await userEvent.clear(screen.getByLabelText("defaultFrom"));
    await userEvent.clear(screen.getByLabelText("defaultUntil"));
    await userEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "updated" }));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/suppliers/s1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      name: "Zulu",
      contractReference: null,
      contactInfo: null,
      defaultFrom: null,
      defaultUntil: null,
    });
    expect(names()).toEqual(["Zeta", "Zulu"]);
    expect(screen.queryByLabelText("name")).not.toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("sends the edited default window dates", async () => {
    mockFetch.mockResolvedValueOnce(json({ id: "s2", defaultFrom: "2027-02-01T00:00:00.000Z", defaultUntil: null }));
    render(<SuppliersClient initialSuppliers={[ZETA]} />);
    await userEvent.click(within(row("Zeta")).getByRole("button", { name: "edit" }));
    await userEvent.type(screen.getByLabelText("defaultFrom"), "2027-02-01");
    await userEvent.type(screen.getByLabelText("contactInfo"), "  call Bob  ");
    await userEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "updated" }));
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      name: "Zeta",
      contractReference: null,
      contactInfo: "call Bob",
      defaultFrom: "2027-02-01",
      defaultUntil: null,
    });
    expect(within(row("Zeta")).getByText(/→ openEnded/)).toBeInTheDocument();
  });

  it("shows the localized window-overlap conflict and keeps the editor open", async () => {
    mockFetch.mockResolvedValueOnce(
      json({ error: "Overlapping window", code: "supplierWindowOverlap", details: ["Acme", "Open"] }, false, 409)
    );
    render(<SuppliersClient initialSuppliers={[ZETA]} />);
    await userEvent.click(within(row("Zeta")).getByRole("button", { name: "edit" }));
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({
        title: "error",
        description: "windowOverlap:Acme, Open",
        variant: "destructive",
      })
    );
    expect(screen.getByLabelText("name")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("uses the API error text for an overlap code without a details list", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Overlapping window", code: "supplierWindowOverlap" }, false, 409));
    render(<SuppliersClient initialSuppliers={[ZETA]} />);
    await userEvent.click(within(row("Zeta")).getByRole("button", { name: "edit" }));
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Overlapping window", variant: "destructive" })
    );
  });
});

describe("SuppliersClient — delete", () => {
  it("deletes after confirmation", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    render(<SuppliersClient initialSuppliers={[ACME, ZETA]} />);
    await userEvent.click(within(row("Acme")).getByRole("button", { name: "delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("deleteConfirmTitle")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "delete" }));

    await waitFor(() => expect(screen.queryByText("Acme")).not.toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledWith("/api/suppliers/s1", { method: "DELETE" });
    expect(mockToast).toHaveBeenCalledWith({ title: "deleted" });
  });

  it("does nothing when the confirmation is cancelled", async () => {
    render(<SuppliersClient initialSuppliers={[ACME]} />);
    await userEvent.click(within(row("Acme")).getByRole("button", { name: "delete" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "cancel" }));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("keeps the row and toasts when deletion fails", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Supplier is in use" }, false, 409));
    render(<SuppliersClient initialSuppliers={[ACME]} />);
    await userEvent.click(within(row("Acme")).getByRole("button", { name: "delete" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "delete" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Supplier is in use", variant: "destructive" })
    );
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });
});
