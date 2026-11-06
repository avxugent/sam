import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    params ? `${key}:${Object.values(params).join(",")}` : key,
}));
// The create dialog has its own tests; here only the trigger matters.
vi.mock("@/components/locations/location-form-dialog", () => ({
  LocationFormDialog: ({ children }: { children: ReactNode }) => children,
}));

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import type { Role } from "@/lib/permissions";

const mockPathname = vi.mocked(usePathname);

const tree = [
  {
    id: "a",
    name: "Campus A",
    inMaintenance: false,
    children: [
      {
        id: "b",
        name: "Building B",
        inMaintenance: false,
        children: [{ id: "c", name: "Room C", inMaintenance: true, children: [] }],
      },
    ],
  },
  { id: "d", name: "Campus D", inMaintenance: false, children: [] },
];

type Props = Parameters<typeof Sidebar>[0];

function renderSidebar(overrides: Partial<Props> = {}) {
  const props: Props = {
    locationTree: tree,
    userRole: "EDITOR" as Role,
    assetCountMap: { a: 5, d: 2 },
    stockItemCount: 4,
    stockTypes: [{ id: "t1", name: "Laptops" }],
    decommissionedCount: 1,
    inRepairCount: 0,
    appTitle: "SAM",
    logoUrl: null,
    ...overrides,
  };
  return render(<Sidebar {...props} />);
}

beforeEach(() => {
  mockPathname.mockReturnValue("/");
});

describe("Sidebar header", () => {
  it("shows the app title, and the logo image when one is configured", () => {
    const { container, unmount } = renderSidebar();
    expect(screen.getByText("SAM")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    unmount();

    const { container: withLogo } = renderSidebar({ logoUrl: "/api/branding/logo" });
    expect(withLogo.querySelector("img")).toHaveAttribute("src", "/api/branding/logo");
  });
});

describe("Sidebar location tree", () => {
  it("lists top-level locations collapsed, with the summed asset total on All locations", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: /Campus A/ })).toHaveAttribute("href", "/locations/a");
    expect(screen.getByRole("link", { name: /Campus D/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Building B/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /allLocations/ })).toHaveTextContent("7");
  });

  it("expands and collapses a location with children", async () => {
    renderSidebar();
    const toggle = screen.getByRole("button", { name: "expandLocation:Campus A" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);
    expect(screen.getByRole("link", { name: /Building B/ })).toBeInTheDocument();
    const collapse = screen.getByRole("button", { name: "collapseLocation:Campus A" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(collapse);
    expect(screen.queryByRole("link", { name: /Building B/ })).not.toBeInTheDocument();
  });

  it("disables the toggle of a location without children", () => {
    renderSidebar();
    const toggle = screen.getByRole("button", { name: "expandLocation:Campus D" });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toHaveAttribute("aria-expanded");
  });

  it("starts with the current location open", () => {
    mockPathname.mockReturnValue("/locations/a");
    renderSidebar();
    expect(screen.getByRole("link", { name: /Building B/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "collapseLocation:Campus A" })).toBeInTheDocument();
  });

  it("opens the path down to a nested current location, and nothing else", () => {
    mockPathname.mockReturnValue("/locations/c/assets/x1");
    renderSidebar();
    expect(screen.getByRole("link", { name: /Room C/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "collapseLocation:Building B" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "collapseLocation:Campus A" })).toBeInTheDocument();
  });

  it("marks a location in maintenance", async () => {
    mockPathname.mockReturnValue("/locations/a");
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "expandLocation:Building B" }));
    const room = screen.getByRole("link", { name: /Room C/ });
    expect(room).toContainElement(screen.getByLabelText("inMaintenance"));
    expect(screen.getByRole("link", { name: /Building B/ })).not.toHaveAccessibleName(/inMaintenance/);
  });
});

describe("Sidebar location filter", () => {
  it("shows matches with their ancestors, highlights them, and hides the rest", async () => {
    const { container } = renderSidebar();
    await userEvent.type(screen.getByLabelText("filterLocations"), "room");

    expect(screen.getByRole("link", { name: /Campus A/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Building B/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Room C/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Campus D/ })).not.toBeInTheDocument();
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("Room C");
    expect(screen.queryByText("noLocationsMatch")).not.toBeInTheDocument();
  });

  it("keeps everything below a matching location visible", async () => {
    renderSidebar();
    await userEvent.type(screen.getByLabelText("filterLocations"), "campus a");
    expect(screen.getByRole("link", { name: /Building B/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Room C/ })).toBeInTheDocument();
  });

  it("says when nothing matches, and the clear button restores the tree", async () => {
    renderSidebar();
    const input = screen.getByLabelText("filterLocations");
    await userEvent.type(input, "zzz");
    expect(screen.getByText("noLocationsMatch")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Campus A/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "clearLocationFilter" }));
    expect(input).toHaveValue("");
    expect(screen.getByRole("link", { name: /Campus A/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "clearLocationFilter" })).not.toBeInTheDocument();
  });
});

describe("Sidebar role-dependent actions", () => {
  it("offers adding a top-level location to editors only", () => {
    const { unmount } = renderSidebar({ userRole: "VIEWER" });
    expect(screen.queryByRole("button", { name: "addTopLocation" })).not.toBeInTheDocument();
    unmount();

    renderSidebar({ userRole: "EDITOR" });
    expect(screen.getByRole("button", { name: "addTopLocation" })).toBeInTheDocument();
  });

  it("shows the empty state, with an add button for editors only", () => {
    const { unmount } = renderSidebar({ locationTree: [], userRole: "VIEWER" });
    expect(screen.getByText("noLocationsYet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "addLocation" })).not.toBeInTheDocument();
    unmount();

    renderSidebar({ locationTree: [], userRole: "ADMIN" });
    expect(screen.getByRole("button", { name: "addLocation" })).toBeInTheDocument();
  });
});

describe("Sidebar stock section", () => {
  it("expanding stock collapses locations (and the other way round)", async () => {
    renderSidebar();
    const locationsHeader = screen.getByRole("button", { name: "locations" });
    expect(locationsHeader).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("link", { name: /allItems/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "expandStock" }));
    expect(screen.getByRole("link", { name: /allItems/ })).toHaveAttribute("href", "/stock");
    expect(screen.getByRole("link", { name: "Laptops" })).toHaveAttribute("href", "/stock?typeId=t1");
    expect(locationsHeader).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("filterLocations")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "addTopLocation" })).not.toBeInTheDocument();

    await userEvent.click(locationsHeader);
    expect(locationsHeader).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("link", { name: /allItems/ })).not.toBeInTheDocument();
  });

  it("collapses stock with its toggle without reopening locations", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "expandStock" }));
    await userEvent.click(screen.getByRole("button", { name: "collapseStock" }));
    expect(screen.queryByRole("link", { name: /allItems/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "locations" })).toHaveAttribute("aria-expanded", "false");
  });

  it("clears the location filter when stock is opened", async () => {
    renderSidebar();
    await userEvent.type(screen.getByLabelText("filterLocations"), "zzz");
    await userEvent.click(screen.getByRole("button", { name: "expandStock" }));
    await userEvent.click(screen.getByRole("button", { name: "locations" }));
    expect(screen.getByLabelText("filterLocations")).toHaveValue("");
  });

  it("starts with stock open on a stock page", () => {
    mockPathname.mockReturnValue("/decommissioned");
    renderSidebar();
    expect(screen.getByRole("button", { name: "collapseStock" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /decommissioned/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "locations" })).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the stock count on the Stock link", () => {
    const { unmount } = renderSidebar();
    expect(screen.getByRole("link", { name: /^stock/ })).toHaveTextContent("4");
    unmount();
    renderSidebar({ stockItemCount: 0 });
    expect(screen.getByRole("link", { name: /^stock/ })).toHaveTextContent(/^stock$/);
  });

  it("disables the stock toggle when there is nothing to list under it", () => {
    renderSidebar({ stockTypes: [], decommissionedCount: 0, inRepairCount: 0 });
    expect(screen.getByRole("button", { name: "expandStock" })).toBeDisabled();
  });

  it("opens the stock section when the Stock link is clicked", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("link", { name: /^stock/ }));
    expect(screen.getByRole("link", { name: /allItems/ })).toBeInTheDocument();
  });
});
