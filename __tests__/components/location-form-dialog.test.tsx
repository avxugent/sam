import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock Next.js router — required by the dialog's useRouter call
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

// Mock fetch — the dialog POSTs to /api/locations
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { LocationFormDialog } from "@/components/locations/location-form-dialog";

function renderDialog(mode: "create" | "edit" = "create") {
  return render(
    <LocationFormDialog mode={mode} parentId={null}>
      <button>Open Dialog</button>
    </LocationFormDialog>
  );
}

async function openDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open Dialog" }));
  return user;
}

describe("<LocationFormDialog /> — create mode", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("opens when the trigger is clicked", async () => {
    renderDialog();
    await openDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Add location")).toBeInTheDocument();
  });

  it("shows the Name field as required", async () => {
    renderDialog();
    await openDialog();
    // Submit without filling in name
    const submitBtn = screen.getByRole("button", { name: "Create location" });
    await userEvent.setup().click(submitBtn);
    await waitFor(() => {
      expect(screen.getByText("Name is required")).toBeInTheDocument();
    });
  });

  it("shows FI number format validation for partial input", async () => {
    renderDialog();
    const user = await openDialog();
    await user.type(screen.getByLabelText(/Name/), "Test Location");
    const fiInput = screen.getByPlaceholderText("14.10.100.013");
    // Type only 7 digits — auto-formats to "14.10.10" which fails the regex
    await user.type(fiInput, "1410100");
    const submitBtn = screen.getByRole("button", { name: "Create location" });
    await user.click(submitBtn);
    await waitFor(() => {
      // Should show Zod error: "Format: CC.BB.FFF.RRR ..."
      expect(screen.getByText(/CC\.BB\.FFF\.RRR/)).toBeInTheDocument();
    });
  });

  it("shows live FI number breakdown when a valid FI is typed", async () => {
    renderDialog();
    const user = await openDialog();
    const fiInput = screen.getByPlaceholderText("14.10.100.013");
    // Type the FI number digit by digit — autoFormat fires on each change
    await user.type(fiInput, "14101000013");
    // Breakdown should appear
    await waitFor(() => {
      expect(screen.getByText(/Campus/)).toBeInTheDocument();
      expect(screen.getByText(/Building/)).toBeInTheDocument();
    });
  });

  it("submits valid data and calls fetch", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new-loc", name: "Room 101" }),
    } as Response);

    renderDialog();
    const user = await openDialog();

    await user.type(screen.getByLabelText(/Name/), "Room 101");
    await user.click(screen.getByRole("button", { name: "Create location" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/locations",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("calls the API and handles a failure response gracefully", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Duplicate FI number" }),
    } as Response);

    renderDialog();
    const user = await openDialog();
    await user.type(screen.getByLabelText(/Name/), "Room");
    await user.click(screen.getByRole("button", { name: "Create location" }));

    // Verify the fetch was called — the dialog handles the error internally via toast
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/locations",
        expect.objectContaining({ method: "POST" })
      );
    });
    // Dialog remains open after API error (not closed on failure)
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("<LocationFormDialog /> — edit mode", () => {
  it("shows 'Edit Location' title", async () => {
    render(
      <LocationFormDialog
        mode="edit"
        locationId="loc-1"
        initialData={{ name: "Campus A", description: null }}
      >
        <button>Open</button>
      </LocationFormDialog>
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("Edit location")).toBeInTheDocument();
  });

  it("pre-fills the name field with initial data", async () => {
    render(
      <LocationFormDialog
        mode="edit"
        locationId="loc-1"
        initialData={{ name: "Campus A", description: "Main campus" }}
      >
        <button>Open</button>
      </LocationFormDialog>
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Open" }));
    const nameInput = screen.getByDisplayValue("Campus A");
    expect(nameInput).toBeInTheDocument();
  });

  it("offers to merge on a name collision, then POSTs the merge", async () => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((_url: string, opts?: { method?: string }) => {
      if (opts?.method === "PUT") {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: "LOCATION_NAME_EXISTS", targetId: "loc-2", targetName: "Campus B" }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ id: "loc-2" }) });
    });

    render(
      <LocationFormDialog
        mode="edit"
        locationId="loc-1"
        initialData={{ name: "Campus A", description: null }}
      >
        <button>Open</button>
      </LocationFormDialog>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open" }));

    const nameInput = screen.getByDisplayValue("Campus A");
    await user.clear(nameInput);
    await user.type(nameInput, "Campus B");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    // Collision -> merge confirmation surfaces instead of an error toast
    const mergeBtn = await screen.findByRole("button", { name: "Merge" });
    await user.click(mergeBtn);

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/locations/loc-1/merge",
        expect.objectContaining({ method: "POST" })
      )
    );
    const body = JSON.parse(
      mockFetch.mock.calls.find((c) => c[0] === "/api/locations/loc-1/merge")![1].body
    );
    expect(body.targetId).toBe("loc-2");
  });
});
