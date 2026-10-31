import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockRefresh, mockToast } = vi.hoisted(() => ({ mockRefresh: vi.fn(), mockToast: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
  usePathname: () => "/",
}));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

// Real English messages, with dotted keys (common's "criticality.HIGH") resolved.
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const messages = require("../../../messages/en.json") as Record<string, unknown>;
    return (key: string, params?: Record<string, string | number>) => {
      const found = `${ns}.${key}`
        .split(".")
        .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);
      const template = typeof found === "string" ? found : key;
      return Object.entries(params ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), template);
    };
  },
}));

import { AssetFormDialog } from "@/components/assets/asset-form-dialog";

const TYPES = [
  { id: "t1", name: "Projector", hostnamePattern: null, defaultCriticality: "HIGH" },
  { id: "t2", name: "Display", hostnamePattern: "^disp-\\d+\\.ugent\\.be$", defaultCriticality: null },
];
const MANUFACTURERS = [
  { id: "m1", name: "Epson" },
  { id: "m2", name: "Sony" },
];
const MODELS = [
  { id: "mo1", name: "EB-W06", typeId: "t1", manufacturerId: "m1" },
  { id: "mo2", name: "Bravia", typeId: "t2", manufacturerId: "m2" },
];
const SUPPLIERS = [
  { id: "sup-old", name: "Old Supplier", defaultFrom: "2000-01-01", defaultUntil: "2001-01-01" },
  { id: "sup-now", name: "Current Supplier", defaultFrom: "2000-01-01", defaultUntil: null },
];
const USERS = [{ id: "u1", name: "Alice" }];

type Reply = { status: number; body?: unknown } | "network";
const json = (body: unknown, status = 200): Reply => ({ status, body });

let requests: { url: string; method: string; body: unknown }[];
/** Per-test overrides keyed by "METHOD path-prefix". */
let overrides: Record<string, Reply>;
let editedAsset: Record<string, unknown>;

function route(url: string, method: string): Reply {
  const key = Object.keys(overrides).find((k) => {
    const [m, p] = k.split(" ");
    return m === method && url.startsWith(p);
  });
  if (key) return overrides[key];
  const params = new URL(url, "http://x").searchParams;
  if (url.startsWith("/api/asset-types")) return json(TYPES);
  if (url.startsWith("/api/suppliers")) return json(SUPPLIERS);
  if (url.startsWith("/api/users/lite")) return json(USERS);
  if (url.startsWith("/api/manufacturers")) {
    const typeId = params.get("typeId");
    const ids = typeId ? MODELS.filter((m) => m.typeId === typeId).map((m) => m.manufacturerId) : null;
    return json(ids ? MANUFACTURERS.filter((m) => ids.includes(m.id)) : MANUFACTURERS);
  }
  if (url.startsWith("/api/models")) {
    const typeId = params.get("typeId");
    const manufacturerId = params.get("manufacturerId");
    return json(
      MODELS.filter((m) => (!typeId || m.typeId === typeId) && (!manufacturerId || m.manufacturerId === manufacturerId))
    );
  }
  if (url === "/api/assets/asset-1" && method === "GET") return json(editedAsset);
  if (method === "POST" || method === "PUT") return json({ id: "new" }, method === "POST" ? 201 : 200);
  return json([]);
}

const mockFetch = vi.fn((url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  requests.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
  const reply = route(url, method);
  if (reply === "network") return Promise.reject(new TypeError("Failed to fetch"));
  return Promise.resolve({
    ok: reply.status < 400,
    status: reply.status,
    json: async () => {
      if (reply.body === undefined) throw new SyntaxError("no body");
      return reply.body;
    },
  } as Response);
});
global.fetch = mockFetch as never;

beforeEach(() => {
  vi.clearAllMocks();
  requests = [];
  overrides = {};
  editedAsset = {
    typeId: "t1",
    manufacturerId: "m1",
    modelId: "mo1",
    serialNumber: "SN-9",
    hostname: "proj.ugent.be",
    quantity: null,
    installationDate: "2024-01-15T00:00:00.000Z",
    invoiceNumber: "INV-7",
    invoiceDate: "2024-01-10T00:00:00.000Z",
    notes: null,
    vaultPath: "secret/av/x",
    ownerId: null,
    criticality: null,
    endOfSupportDate: null,
    supplierId: null,
    macAddresses: [{ address: "AA:BB:CC:DD:EE:01" }],
    customFields: [{ key: "rack", value: "R1" }],
  };
});

const onSuccess = vi.fn();

async function openCreate() {
  render(
    <AssetFormDialog mode="create" locationId="loc-1" onSuccess={onSuccess}>
      <button>Open</button>
    </AssetFormDialog>
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  // Dropdowns loaded and the supplier whose window covers today pre-selected.
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Supplier" })).toHaveTextContent("Current Supplier"));
  return user;
}

async function pickSelect(user: ReturnType<typeof userEvent.setup>, label: RegExp | string, option: string) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

async function pickModel(user: ReturnType<typeof userEvent.setup>, text: string, option: string) {
  await user.type(screen.getByPlaceholderText("e.g. Epson EB-W06"), text);
  fireEvent.mouseDown(await screen.findByRole("button", { name: option }));
}

function lastWrite() {
  return requests.filter((r) => r.method !== "GET").at(-1);
}

describe("<AssetFormDialog /> create", () => {
  it("posts the full payload: dates, picked selects, normalized MAC and non-empty custom fields", async () => {
    const user = await openCreate();

    // Picking a model fills in its type and manufacturer.
    await pickModel(user, "EB", "EB-W06");
    await waitFor(() => expect(screen.getByRole("combobox", { name: /^Type/ })).toHaveTextContent("Projector"));
    await waitFor(() => expect(screen.getByPlaceholderText("Select manufacturer…")).toHaveValue("Epson"));

    await user.type(screen.getByPlaceholderText("SN-XXXX"), "SN-1");
    await user.type(screen.getByPlaceholderText("device.example.com"), "  proj.ugent.be ");
    await user.click(screen.getByRole("button", { name: /Add MAC/i }));
    await user.type(screen.getByRole("textbox", { name: "MAC address 1" }), "aabbccddeeff");
    fireEvent.change(screen.getByLabelText("Installation Date"), { target: { value: "2024-05-01" } });
    fireEvent.change(screen.getByLabelText("End of support"), { target: { value: "2030-12-31" } });
    await user.type(screen.getByLabelText("Invoice Number"), "INV-1");

    await pickSelect(user, "Owner", "Alice");
    // The inherit option names the selected type's default level.
    await user.click(screen.getByRole("combobox", { name: "Criticality" }));
    expect(await screen.findByRole("option", { name: "Inherit from type (High)" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Critical" }));

    await user.click(screen.getByRole("button", { name: "Add custom field" }));
    await user.click(screen.getByRole("button", { name: "Add custom field" }));
    const names = screen.getAllByPlaceholderText("Field name");
    await user.type(names[0], "rack");
    await user.type(screen.getAllByPlaceholderText("Value")[0], "R1");
    await user.type(screen.getAllByPlaceholderText("Value")[1], "orphan value");

    await user.click(screen.getByRole("button", { name: "Create asset" }));

    await waitFor(() => expect(lastWrite()).toBeDefined());
    const req = lastWrite()!;
    expect(req.url).toBe("/api/locations/loc-1/assets");
    expect(req.method).toBe("POST");
    expect(req.body).toMatchObject({
      typeId: "t1",
      manufacturerId: "m1",
      modelId: "mo1",
      serialNumber: "SN-1",
      hostname: "proj.ugent.be",
      quantity: 1,
      installationDate: "2024-05-01",
      endOfSupportDate: "2030-12-31",
      invoiceNumber: "INV-1",
      ownerId: "u1",
      supplierId: "sup-now",
      criticality: "CRITICAL",
      vaultPath: null,
      macAddresses: ["AA:BB:CC:DD:EE:FF"],
      customFields: [{ key: "rack", value: "R1" }],
    });

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "Asset created" }));
    expect(mockRefresh).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("omits owner and supplier for 'use default' and sends null criticality for 'inherit'", async () => {
    const user = await openCreate();
    // Choose the type first: picking a model then keeps it.
    await pickSelect(user, /^Type/, "Display");
    await pickModel(user, "Bra", "Bravia");
    await waitFor(() => expect(screen.getByPlaceholderText("Select manufacturer…")).toHaveValue("Sony"));
    await pickSelect(user, "Supplier", "None");
    await user.click(screen.getByRole("combobox", { name: "Criticality" }));
    expect(await screen.findByRole("option", { name: "Inherit from type" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Medium" }));
    await pickSelect(user, "Criticality", "Inherit from type");
    await pickSelect(user, "Owner", "Alice");
    await pickSelect(user, "Owner", "Default owner");

    const qty = screen.getByLabelText("Quantity");
    await user.clear(qty);
    await user.type(qty, "4");

    await user.click(screen.getByRole("button", { name: "Create asset" }));
    await waitFor(() => expect(lastWrite()).toBeDefined());
    const body = lastWrite()!.body as Record<string, unknown>;
    expect(body.typeId).toBe("t2");
    expect(body.modelId).toBe("mo2");
    expect(body.quantity).toBe(4);
    expect(body.criticality).toBeNull();
    expect(body.hostname).toBeNull();
    expect(body.endOfSupportDate).toBeNull();
    expect(body).not.toHaveProperty("ownerId");
    expect(body).not.toHaveProperty("supplierId");
    expect(body.macAddresses).toEqual([]);
  });

  it("clears type back to the 'select' placeholder via the none option", async () => {
    const user = await openCreate();
    await pickSelect(user, /^Type/, "Projector");
    await pickSelect(user, /^Type/, "— Select a type —");
    await user.click(screen.getByRole("button", { name: "Create asset" }));
    expect(await screen.findByText("Type is required")).toBeInTheDocument();
  });

  it("locks quantity to 1 once a MAC address is typed, and unlocks when it is removed", async () => {
    const user = await openCreate();
    const qty = screen.getByLabelText("Quantity");
    await user.clear(qty);
    await user.type(qty, "3");
    await user.click(screen.getByRole("button", { name: /Add MAC/i }));
    await user.type(screen.getByRole("textbox", { name: "MAC address 1" }), "aa");
    await waitFor(() => expect(qty).toBeDisabled());
    expect(qty).toHaveValue(1);
    await user.click(screen.getByRole("button", { name: /Remove MAC address 1/i }));
    await waitFor(() => expect(qty).not.toBeDisabled());
  });

  it("drops the manufacturer when a type change scopes it out", async () => {
    const user = await openCreate();
    const mfr = screen.getByPlaceholderText("Select manufacturer…");
    await user.type(mfr, "Son");
    fireEvent.mouseDown(await screen.findByRole("button", { name: "Sony" }));
    await waitFor(() => expect(mfr).toHaveValue("Sony"));
    // Sony makes no Projector model.
    await pickSelect(user, /^Type/, "Projector");
    await waitFor(() => expect(mfr).toHaveValue(""));
    await user.click(screen.getByRole("button", { name: "Create asset" }));
    expect(await screen.findByText("Manufacturer is required")).toBeInTheDocument();
  });

  it("closes on Cancel without saving", async () => {
    const user = await openCreate();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(lastWrite()).toBeUndefined();
  });
});

describe("<AssetFormDialog /> validation", () => {
  it("checks the hostname against the selected type's pattern", async () => {
    const user = await openCreate();
    await pickSelect(user, /^Type/, "Display");
    expect(screen.getByText("Must match: ^disp-\\d+\\.ugent\\.be$")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("device.example.com"), "proj.ugent.be");
    await user.click(screen.getByRole("button", { name: "Create asset" }));
    expect(await screen.findByText("Hostname does not match the required format for Display.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("device.example.com")).toHaveAttribute("aria-invalid", "true");
  });

  it("requires a fully qualified hostname without a type pattern, and a MAC with it", async () => {
    const user = await openCreate();
    await user.type(screen.getByPlaceholderText("device.example.com"), "projector");
    expect(screen.getByText("(MAC address required when hostname is set)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create asset" }));
    expect(
      await screen.findByText("Hostname must be a fully qualified domain name (e.g. device.example.com)")
    ).toBeInTheDocument();
    expect(screen.getByText("At least one MAC address is required when a hostname is set.")).toBeInTheDocument();
    expect(lastWrite()).toBeUndefined();
  });

  it("blocks a quantity below 1 with the input's native min constraint", async () => {
    const user = await openCreate();
    const qty = screen.getByLabelText("Quantity") as HTMLInputElement;
    await user.clear(qty);
    await user.type(qty, "0");
    expect(qty.validity.rangeUnderflow).toBe(true);
    await user.click(screen.getByRole("button", { name: "Create asset" }));
    expect(lastWrite()).toBeUndefined();
  });

  it("flags an emptied quantity under the field", async () => {
    const user = await openCreate();
    const qty = screen.getByLabelText("Quantity");
    await user.clear(qty);
    await user.click(screen.getByRole("button", { name: "Create asset" }));
    await waitFor(() => expect(qty).toHaveAttribute("aria-invalid", "true"));
    expect(screen.queryByText("Only for bulk items with no individual identity")).not.toBeInTheDocument();
    expect(lastWrite()).toBeUndefined();
  });
});

describe("<AssetFormDialog /> API errors", () => {
  async function submitValid(user: ReturnType<typeof userEvent.setup>) {
    await pickModel(user, "EB", "EB-W06");
    await waitFor(() => expect(screen.getByPlaceholderText("Select manufacturer…")).toHaveValue("Epson"));
    await user.click(screen.getByRole("button", { name: "Create asset" }));
  }

  it("toasts the API error with its details and keeps the dialog open", async () => {
    overrides["POST /api/locations/"] = json({ error: "Conflict", details: ["serial taken"] }, 409);
    const user = await openCreate();
    await submitValid(user);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "Error", description: "Conflict: serial taken", variant: "destructive" })
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for a body-less 500", async () => {
    overrides["POST /api/locations/"] = { status: 500 };
    const user = await openCreate();
    await submitValid(user);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "Error", description: "Something went wrong.", variant: "destructive" })
    );
  });

  it("still renders the form when the dropdown requests fail", async () => {
    overrides["GET /api/asset-types"] = { status: 500 };
    overrides["GET /api/suppliers"] = { status: 500 };
    overrides["GET /api/users/lite"] = { status: 500 };
    render(
      <AssetFormDialog mode="create" locationId="loc-1">
        <button>Open</button>
      </AssetFormDialog>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("combobox", { name: "Supplier" }));
    expect(await screen.findAllByRole("option")).toHaveLength(1);
  });
});

describe("<AssetFormDialog /> edit", () => {
  async function openEdit() {
    render(
      <AssetFormDialog mode="edit" locationId="loc-1" assetId="asset-1">
        <button>Open</button>
      </AssetFormDialog>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.getByPlaceholderText("e.g. Epson EB-W06")).toHaveValue("EB-W06"));
    return user;
  }

  it("prefills every field from the asset", async () => {
    await openEdit();
    expect(screen.getByRole("heading", { name: "Edit asset" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("SN-XXXX")).toHaveValue("SN-9");
    expect(screen.getByPlaceholderText("device.example.com")).toHaveValue("proj.ugent.be");
    expect(screen.getByLabelText("Installation Date")).toHaveValue("2024-01-15");
    expect(screen.getByLabelText("Invoice Date")).toHaveValue("2024-01-10");
    expect(screen.getByLabelText("Invoice Number")).toHaveValue("INV-7");
    expect(screen.getByRole("textbox", { name: "MAC address 1" })).toHaveValue("AA:BB:CC:DD:EE:01");
    expect(screen.getByPlaceholderText("Field name")).toHaveValue("rack");
    expect(screen.getByPlaceholderText("Value")).toHaveValue("R1");
    expect(screen.getByPlaceholderText("secret/av/rectest001")).toHaveValue("secret/av/x");
    expect(screen.getByLabelText("Quantity")).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Owner" })).toHaveTextContent("Default owner"));
    expect(screen.getByRole("combobox", { name: "Criticality" })).toHaveTextContent("Inherit from type (High)");
  });

  it("PUTs the edited asset with explicit nulls for cleared owner and supplier", async () => {
    const user = await openEdit();
    // The custom-field row's delete button has no accessible name; reach it through its row.
    const cfRow = screen.getByPlaceholderText("Field name").parentElement!;
    await user.click(within(cfRow).getByRole("button"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(lastWrite()).toBeDefined());
    const req = lastWrite()!;
    expect(req.url).toBe("/api/assets/asset-1");
    expect(req.method).toBe("PUT");
    expect(req.body).toMatchObject({
      typeId: "t1",
      manufacturerId: "m1",
      modelId: "mo1",
      serialNumber: "SN-9",
      hostname: "proj.ugent.be",
      quantity: 1,
      installationDate: "2024-01-15",
      invoiceDate: "2024-01-10",
      notes: "",
      vaultPath: "secret/av/x",
      ownerId: null,
      supplierId: null,
      criticality: null,
      endOfSupportDate: null,
      macAddresses: ["AA:BB:CC:DD:EE:01"],
      customFields: [],
    });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "Asset updated" }));
  });

  it("keeps the form blank when the asset cannot be loaded", async () => {
    overrides["GET /api/assets/asset-1"] = json({ error: "Not found" }, 404);
    render(
      <AssetFormDialog mode="edit" locationId="loc-1" assetId="asset-1">
        <button>Open</button>
      </AssetFormDialog>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(requests.some((r) => r.url === "/api/assets/asset-1")).toBe(true));
    expect(screen.getByPlaceholderText("SN-XXXX")).toHaveValue("");
  });
});

describe("<AssetFormDialog /> Vault test", () => {
  async function testPath(reply: Reply) {
    overrides["GET /api/vault/test"] = reply;
    const user = await openCreate();
    const test = screen.getByRole("button", { name: "Test" });
    expect(test).toBeDisabled();
    await user.type(screen.getByPlaceholderText("secret/av/rectest001"), "   ");
    expect(test).toBeDisabled();
    await user.type(screen.getByPlaceholderText("secret/av/rectest001"), "secret/av/a b ");
    await user.click(test);
    expect(requests.at(-1)!.url).toBe("/api/vault/test?path=secret%2Fav%2Fa%20b");
  }

  it("shows the message and key names on success", async () => {
    await testPath(json({ message: "Path is readable", keys: ["username", "password"] }));
    expect(await screen.findByText("Path is readable")).toBeInTheDocument();
    expect(screen.getByText("Keys:")).toBeInTheDocument();
    expect(screen.getByText("username")).toBeInTheDocument();
    expect(screen.getByText("password")).toBeInTheDocument();
  });

  it("shows 'Unknown result' for a success without a message or keys", async () => {
    await testPath(json({}));
    expect(await screen.findByText("Unknown result")).toBeInTheDocument();
    expect(screen.queryByText("Keys:")).not.toBeInTheDocument();
  });

  it("shows the API error for a 404", async () => {
    await testPath(json({ error: "No secret at this path" }, 404));
    expect(await screen.findByText("No secret at this path")).toBeInTheDocument();
  });

  it("shows 'Unknown result' for a body-less 502", async () => {
    await testPath({ status: 502 });
    expect(await screen.findByText("Unknown result")).toBeInTheDocument();
  });

  it("shows a network error when the request never reaches the server", async () => {
    await testPath("network");
    expect(await screen.findByText("Request failed — check your network.")).toBeInTheDocument();
  });
});
