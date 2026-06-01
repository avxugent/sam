import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ usePathname: () => "/locations/x" }));
const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));

import { LocationBrowserClient, type LocationNode } from "@/components/locations/location-browser-client";

const TREE: LocationNode[] = [
  {
    id: "campus", name: "Campus A", fiNumber: "14.10.000.000", children: [
      { id: "room", name: "Room 101", fiNumber: "14.10.100.013", children: [] },
    ],
  },
  { id: "campusb", name: "Campus B", fiNumber: null, children: [] },
];
const COUNTS = { campus: 5, room: 2, campusb: 0 };

const renderBrowser = (tree = TREE, counts = COUNTS) =>
  render(<LocationBrowserClient locationTree={tree} assetCountMap={counts} />);

beforeEach(() => vi.clearAllMocks());

describe("<LocationBrowserClient />", () => {
  it("renders the top-level locations and their asset counts", () => {
    renderBrowser();
    expect(screen.getByText("Campus A")).toBeInTheDocument();
    expect(screen.getByText("Campus B")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows the empty state when there are no locations", () => {
    renderBrowser([]);
    expect(screen.getByText("noLocationsYet")).toBeInTheDocument();
  });

  it("expands a node to reveal its children", async () => {
    const user = userEvent.setup();
    renderBrowser();
    expect(screen.queryByText("Room 101")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand Campus A" }));
    expect(screen.getByText("Room 101")).toBeInTheDocument();
  });

  it("filters the tree and auto-expands matching branches", async () => {
    const user = userEvent.setup();
    renderBrowser();
    await user.type(screen.getByPlaceholderText("filterLocations"), "Room 101");
    expect(screen.getByText("Room 101")).toBeInTheDocument();
    // non-matching top-level branch disappears
    expect(screen.queryByText("Campus B")).not.toBeInTheDocument();
  });

  it("shows the no-match message and clears the filter", async () => {
    const user = userEvent.setup();
    renderBrowser();
    const input = screen.getByPlaceholderText("filterLocations");
    await user.type(input, "zzzzz");
    expect(screen.getByText("noLocationsMatch")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(screen.getByText("Campus A")).toBeInTheDocument();
  });
});
