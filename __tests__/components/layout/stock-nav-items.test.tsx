import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/stock"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { usePathname, useSearchParams } from "next/navigation";
import { StockNavItems } from "@/components/layout/stock-nav-items";

const mockPathname = vi.mocked(usePathname);
const mockSearchParams = vi.mocked(useSearchParams);

function setLocation(pathname: string, query = "") {
  mockPathname.mockReturnValue(pathname);
  mockSearchParams.mockReturnValue(new URLSearchParams(query) as never);
}

function renderItems(counts: { stock?: number; decommissioned?: number; inRepair?: number } = {}) {
  return render(
    <StockNavItems
      stockTypes={[
        { id: "t1", name: "Laptops" },
        { id: "t2", name: "Monitors" },
      ]}
      stockItemCount={counts.stock ?? 9}
      decommissionedCount={counts.decommissioned ?? 3}
      inRepairCount={counts.inRepair ?? 2}
    />
  );
}

beforeEach(() => setLocation("/stock"));

describe("StockNavItems", () => {
  it("links all items, every stock type, decommissioned and in repair", () => {
    renderItems();
    expect(screen.getByRole("link", { name: /allItems/ })).toHaveAttribute("href", "/stock");
    expect(screen.getByRole("link", { name: "Laptops" })).toHaveAttribute("href", "/stock?typeId=t1");
    expect(screen.getByRole("link", { name: "Monitors" })).toHaveAttribute("href", "/stock?typeId=t2");
    expect(screen.getByRole("link", { name: /decommissioned/ })).toHaveAttribute("href", "/decommissioned");
    expect(screen.getByRole("link", { name: /inRepair/ })).toHaveAttribute("href", "/in-repair");
  });

  it("shows counts only when they are above zero", () => {
    const { unmount } = renderItems();
    expect(screen.getByRole("link", { name: /allItems/ })).toHaveTextContent("allItems9");
    expect(screen.getByRole("link", { name: /decommissioned/ })).toHaveTextContent("decommissioned3");
    expect(screen.getByRole("link", { name: /inRepair/ })).toHaveTextContent("inRepair2");
    unmount();

    renderItems({ stock: 0, decommissioned: 0, inRepair: 0 });
    expect(screen.getByRole("link", { name: /allItems/ })).toHaveTextContent(/^allItems$/);
    expect(screen.getByRole("link", { name: /decommissioned/ })).toHaveTextContent(/^decommissioned$/);
    expect(screen.getByRole("link", { name: /inRepair/ })).toHaveTextContent(/^inRepair$/);
  });

  // The active entry is only distinguished visually (font weight).
  it("highlights All items on /stock without a type filter", () => {
    renderItems();
    expect(screen.getByRole("link", { name: /allItems/ })).toHaveClass("font-semibold");
    expect(screen.getByRole("link", { name: "Laptops" })).not.toHaveClass("font-semibold");
  });

  it("highlights the filtered stock type instead of All items", () => {
    setLocation("/stock", "typeId=t2");
    renderItems();
    expect(screen.getByRole("link", { name: "Monitors" })).toHaveClass("font-semibold");
    expect(screen.getByRole("link", { name: "Laptops" })).not.toHaveClass("font-semibold");
    expect(screen.getByRole("link", { name: /allItems/ })).not.toHaveClass("font-semibold");
  });

  it("highlights decommissioned and in repair on their own pages", () => {
    setLocation("/decommissioned");
    const { unmount } = renderItems();
    expect(screen.getByRole("link", { name: /decommissioned/ })).toHaveClass("font-semibold");
    expect(screen.getByRole("link", { name: /inRepair/ })).not.toHaveClass("font-semibold");
    expect(screen.getByRole("link", { name: /allItems/ })).not.toHaveClass("font-semibold");
    unmount();

    setLocation("/in-repair");
    renderItems();
    expect(screen.getByRole("link", { name: /inRepair/ })).toHaveClass("font-semibold");
    expect(screen.getByRole("link", { name: /decommissioned/ })).not.toHaveClass("font-semibold");
  });
});
