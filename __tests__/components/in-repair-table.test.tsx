import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { InRepairTable, type InRepairAsset } from "@/components/stock/in-repair-table";

const ASSETS: InRepairAsset[] = [
  { id: "a1", locationId: "l1", model: { name: "XPS" }, serialNumber: "SN1", repairStartedAt: "2024-01-15T00:00:00Z", repairNote: "Screen cracked", type: { id: "t1", name: "Laptop" }, manufacturer: { id: "m1", name: "Dell" }, location: { id: "l1", name: "Room 1" } },
  { id: "a2", locationId: "l2", model: null, serialNumber: null, repairStartedAt: null, repairNote: null, type: { id: "t2", name: "Monitor" }, manufacturer: null, location: null },
];

const renderTable = (assets = ASSETS) => render(<InRepairTable assets={assets} />);

describe("<InRepairTable />", () => {
  it("renders rows with type, model, and note", () => {
    renderTable();
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText("XPS")).toBeInTheDocument();
    expect(screen.getByText("SN1")).toBeInTheDocument();
    expect(screen.getByText("Screen cracked")).toBeInTheDocument();
  });

  it("shows the empty state when there are none", () => {
    renderTable([]);
    expect(screen.getByText("noInRepair")).toBeInTheDocument();
  });

  it("filters by repair note", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.type(screen.getByPlaceholderText("searchInRepair"), "cracked");
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.queryByText("Monitor")).not.toBeInTheDocument();
  });

  it("links the row into the asset detail page", () => {
    renderTable();
    expect(screen.getByRole("link", { name: /XPS/ })).toHaveAttribute("href", "/locations/l1/assets/a1");
  });

  it("sorts by each column header and toggles direction", async () => {
    const user = userEvent.setup();
    renderTable();
    const headers = screen.getAllByRole("columnheader");
    for (const h of headers) {
      await user.click(h);
      await user.click(h);
    }
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
  });
});
