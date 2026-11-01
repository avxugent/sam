import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@/components/layout/language-switcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

import { Header } from "@/components/layout/header";
import { apiFetch } from "@/lib/api-client";
import { signOut } from "next-auth/react";

const mockApiFetch = vi.mocked(apiFetch);

const SEARCH_RESPONSE = {
  assets: [
    {
      id: "a1",
      hostname: "pc1",
      serialNumber: "SN1",
      model: { name: "XPS 13" },
      type: { name: "Laptop" },
      location: { id: "l1", name: "Room 1" },
    },
  ],
  locations: [{ id: "l2", name: "Room 2", fiNumber: "14.10.100.013", _count: { assets: 3 } }],
};

function renderHeader() {
  render(<Header user={{ name: "Pat", email: "pat@x.com", role: "VIEWER" }} appTitle="SAM" logoUrl={null} />);
  return screen.getByRole("combobox");
}

async function typeAndWaitForResults(input: HTMLElement, text = "pc") {
  await userEvent.type(input, text);
  return screen.findByRole("listbox");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue({ ok: true, status: 200, data: SEARCH_RESPONSE } as never);
});

describe("Header quick search", () => {
  it("fetches once the query reaches two characters and lists assets and locations", async () => {
    const input = renderHeader();
    await typeAndWaitForResults(input);

    expect(mockApiFetch).toHaveBeenCalledWith("/api/search?q=pc", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(mockApiFetch).not.toHaveBeenCalledWith("/api/search?q=p", expect.anything());
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("XPS 13");
    expect(options[0]).toHaveTextContent("Laptop · Room 1");
    expect(options[1]).toHaveTextContent("Room 2");
    expect(options[1]).toHaveTextContent("14.10.100.013");
  });

  it("ArrowDown and Enter open the highlighted result", async () => {
    const input = renderHeader();
    await typeAndWaitForResults(input);

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", "global-search-result-0");
    await userEvent.keyboard("{Enter}");

    expect(push).toHaveBeenCalledWith("/locations/l1/assets/a1");
    expect(input).toHaveValue("");
  });

  it("ArrowUp wraps to the last result", async () => {
    const input = renderHeader();
    await typeAndWaitForResults(input);

    await userEvent.keyboard("{ArrowUp}{Enter}");
    expect(push).toHaveBeenCalledWith("/locations/l2");
  });

  it("Enter without a highlighted result opens the full search page", async () => {
    const input = renderHeader();
    await typeAndWaitForResults(input, "room 1");

    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/search?q=room%201");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("the see-all button opens the full search page", async () => {
    const input = renderHeader();
    await typeAndWaitForResults(input);

    await userEvent.click(screen.getByRole("button", { name: "seeAllResultsFor" }));
    expect(push).toHaveBeenCalledWith("/search?q=pc");
  });

  it("clicking a result navigates to it", async () => {
    const input = renderHeader();
    await typeAndWaitForResults(input);

    await userEvent.click(screen.getAllByRole("option")[1]);
    expect(push).toHaveBeenCalledWith("/locations/l2");
  });

  it("shortening the query below two characters clears the results", async () => {
    const input = renderHeader();
    await typeAndWaitForResults(input);

    await userEvent.type(input, "{Backspace}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("titles an asset without a model by its hostname, then serial number", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        assets: [
          { ...SEARCH_RESPONSE.assets[0], id: "a2", model: null, type: null },
          { ...SEARCH_RESPONSE.assets[0], id: "a3", model: null, type: null, hostname: null },
        ],
        locations: [],
      },
    } as never);
    const input = renderHeader();
    await typeAndWaitForResults(input);

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("pc1");
    expect(options[0]).toHaveTextContent("Room 1");
    expect(options[1]).toHaveTextContent("SN1");
  });

  it("shows no results when the search request fails", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500, error: {} } as never);
    const input = renderHeader();
    await userEvent.type(input, "pc");

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Escape closes the results and focusing the input reopens them", async () => {
    const input = renderHeader();
    await typeAndWaitForResults(input);

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await userEvent.click(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("a click outside closes the results", async () => {
    const input = renderHeader();
    await typeAndWaitForResults(input);

    await userEvent.click(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("the clear button empties the query and the results", async () => {
    const input = renderHeader();
    await typeAndWaitForResults(input);

    await userEvent.click(screen.getByRole("button", { name: "close" }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("Header account menu", () => {
  it("shows the logo, the 2FA state for credential users, and signs out", async () => {
    render(
      <Header
        user={{ name: "Pat", email: "pat@x.com", role: "VIEWER", provider: "credentials", totpEnabled: true }}
        appTitle="My SAM"
        logoUrl="/api/branding/logo"
      />
    );
    expect(screen.getByText("My SAM")).toBeInTheDocument();
    expect(document.querySelector('img[src="/api/branding/logo"]')).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "accountMenu" }));
    expect(screen.getByRole("menuitem", { name: /twoFactorAuth/ })).toHaveTextContent("twoFactorOn");
    await userEvent.click(screen.getByRole("menuitem", { name: "signOut" }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });

  it("hides the 2FA entry for SSO users", async () => {
    render(<Header user={{ name: null, email: "sso@x.com", role: "VIEWER", provider: "microsoft-entra-id" }} appTitle="SAM" logoUrl={null} />);
    await userEvent.click(screen.getByRole("button", { name: "accountMenu" }));
    expect(screen.queryByRole("menuitem", { name: /twoFactorAuth/ })).not.toBeInTheDocument();
  });
});
