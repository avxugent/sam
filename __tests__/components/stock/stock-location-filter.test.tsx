import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/stock",
  useSearchParams: () => mockSearchParams,
}));

import { StockLocationFilter } from "@/components/stock/stock-location-filter";

const LOCATIONS = [
  { id: "loc1", breadcrumb: "Campus A › Storage Room" },
  { id: "loc2", breadcrumb: "Campus B › Workshop" },
];

describe("<StockLocationFilter />", () => {
  it("shows 'allLocations' when no locationId is in the URL", () => {
    mockSearchParams = new URLSearchParams();
    render(<StockLocationFilter locations={LOCATIONS} />);
    expect(screen.getByText("allLocations")).toBeInTheDocument();
  });

  it("shows the matching breadcrumb when locationId is in the URL", () => {
    mockSearchParams = new URLSearchParams("locationId=loc2");
    render(<StockLocationFilter locations={LOCATIONS} />);
    expect(screen.getByText("Campus B › Workshop")).toBeInTheDocument();
  });
});
