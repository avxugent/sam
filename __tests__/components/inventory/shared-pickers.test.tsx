import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationSearchList } from "@/components/inventory/location-search-list";
import { StockLocationPicker } from "@/components/inventory/stock-location-picker";
import type { FlatLocation } from "@/lib/locations/tree";

const locations: FlatLocation[] = [
  { id: "a", name: "Room A", breadcrumb: "Campus › Room A", hasStock: true },
  { id: "b", name: "Room B", breadcrumb: "Campus › Room B", hasStock: false },
];

describe("LocationSearchList", () => {
  function setup(props: Partial<Parameters<typeof LocationSearchList>[0]> = {}) {
    const onSelect = vi.fn();
    const onQueryChange = vi.fn();
    render(
      <LocationSearchList
        locations={locations}
        loading={false}
        query=""
        onQueryChange={onQueryChange}
        selectedId={null}
        onSelect={onSelect}
        placeholder="search"
        emptyText="none"
        {...props}
      />
    );
    return { onSelect, onQueryChange };
  }

  it("filters by breadcrumb and reports the selection", async () => {
    const { onSelect } = setup({ query: "room b" });
    expect(screen.queryByText("Room A")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Room B/ }));
    expect(onSelect).toHaveBeenCalledWith(locations[1]);
  });

  it("shows the empty text and forwards typing", async () => {
    const { onQueryChange } = setup({ query: "zzz" });
    expect(screen.getByText("none")).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("search"), "x");
    expect(onQueryChange).toHaveBeenCalledWith("zzzx");
  });

  it("shows a spinner instead of the list while loading", () => {
    setup({ loading: true });
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("StockLocationPicker", () => {
  it("hides locations without stock until 'show all' is ticked", async () => {
    const onSelect = vi.fn();
    render(
      <StockLocationPicker locations={locations} selectedId="" onSelect={onSelect} placeholder="search" showAllLabel="all" emptyText="none" idPrefix="t" />
    );
    expect(screen.queryByText("Room B")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "all" }));
    await userEvent.click(screen.getByRole("button", { name: /Room B/ }));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("offers an unassigned row that clears the selection", async () => {
    const onSelect = vi.fn();
    render(
      <StockLocationPicker locations={[]} selectedId="a" onSelect={onSelect} placeholder="search" showAllLabel="all" unassignedLabel="unassigned" idPrefix="t" />
    );
    await userEvent.click(screen.getByRole("button", { name: "unassigned" }));
    expect(onSelect).toHaveBeenCalledWith("");
  });
});
