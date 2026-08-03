import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
  usePathname: () => "/",
}));
const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { AssetTable } from "@/components/assets/asset-table";

// Deliberately out of alphabetical type order, so a passing test proves the
// table actually sorts rather than just happening to echo insertion order.
const assets = [
  { id: "a1", model: "Model-Screen", serialNumber: "S1", hostname: null, installationDate: null, type: { id: "t2", name: "Screen" }, manufacturer: null, macAddresses: [], _count: { attachments: 0 }, location: null },
  { id: "a2", model: "Model-Camera", serialNumber: "S2", hostname: null, installationDate: null, type: { id: "t1", name: "Camera" }, manufacturer: null, macAddresses: [], _count: { attachments: 0 }, location: null },
  { id: "a3", model: "Model-Projector", serialNumber: "S3", hostname: null, installationDate: null, type: { id: "t3", name: "Projector" }, manufacturer: null, macAddresses: [], _count: { attachments: 0 }, location: null },
];

describe("<AssetTable /> default sort", () => {
  it("sorts by asset type ascending without any column click", () => {
    render(
      <AssetTable assets={assets} locationId="loc-1" userRole="ADMIN" />
    );

    const rows = screen.getAllByRole("link");
    const modelOrder = rows.map((row) => {
      const match = row.textContent?.match(/Model-(Screen|Camera|Projector)/);
      return match ? match[0] : null;
    });

    // Camera, Projector, Screen — alphabetical by type name.
    expect(modelOrder).toEqual(["Model-Camera", "Model-Projector", "Model-Screen"]);
  });
});
