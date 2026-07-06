import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

describe("<AssetFormDialog /> model similarity warning", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/asset-types")) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }
      if (url.includes("/api/manufacturers")) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }
      if (url.includes("/api/models/similar")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ match: { model: "PowerEdge R740", distance: 0 } }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    });
  });

  it("shows the 'Did you mean' dialog when blurring with a fuzzy match", async () => {
    renderDialog();
    const user = await openDialog();

    const modelInput = screen.getByPlaceholderText(/Epson EB-W06/i);
    await user.type(modelInput, "poweredge r740");
    fireEvent.blur(modelInput);

    await waitFor(() => {
      expect(screen.getByText("Did you mean an existing model?")).toBeInTheDocument();
    });
    expect(screen.getByText(/PowerEdge R740/)).toBeInTheDocument();
  });

  it("fills the input and closes the dialog when 'Use existing' is clicked", async () => {
    renderDialog();
    const user = await openDialog();

    const modelInput = screen.getByPlaceholderText(/Epson EB-W06/i) as HTMLInputElement;
    await user.type(modelInput, "poweredge r740");
    fireEvent.blur(modelInput);

    await waitFor(() => {
      expect(screen.getByText("Did you mean an existing model?")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Use existing" }));

    await waitFor(() => {
      expect(screen.queryByText("Did you mean an existing model?")).not.toBeInTheDocument();
    });
    expect(modelInput).toHaveValue("PowerEdge R740");
  });

  it("does not re-prompt for the same value after 'Keep mine' is clicked", async () => {
    renderDialog();
    const user = await openDialog();

    const modelInput = screen.getByPlaceholderText(/Epson EB-W06/i);
    await user.type(modelInput, "poweredge r740");
    fireEvent.blur(modelInput);

    await waitFor(() => {
      expect(screen.getByText("Did you mean an existing model?")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Keep mine" }));

    await waitFor(() => {
      expect(screen.queryByText("Did you mean an existing model?")).not.toBeInTheDocument();
    });

    const callsAfterDismiss = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/api/models/similar")
    ).length;

    fireEvent.blur(modelInput);

    await waitFor(() => {
      const callsAfterSecondBlur = mockFetch.mock.calls.filter((c) =>
        String(c[0]).includes("/api/models/similar")
      ).length;
      expect(callsAfterSecondBlur).toBe(callsAfterDismiss);
    });
    expect(screen.queryByText("Did you mean an existing model?")).not.toBeInTheDocument();
  });
});
