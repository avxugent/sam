import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { HostnameComplianceClient } from "@/components/compliance/hostname-compliance-client";
import type { HostnameComplianceResult } from "@/lib/hostname-compliance";

const RESULT: HostnameComplianceResult = {
  overall: { measured: 3, compliant: 2, nonCompliant: 1, rate: 2 / 3 },
  types: [
    {
      typeId: "t1",
      typeName: "Web",
      pattern: "^web-",
      measured: 2,
      compliant: 1,
      nonCompliant: 1,
      noHostname: 0,
      rate: 0.5,
      nonCompliantAssets: [
        { id: "a1", hostname: "bad-host", model: "OptiPlex", serialNumber: "SN1", locationPath: "Campus A - Room 1", fiNumber: "14.10.100.013" },
      ],
    },
    {
      typeId: "t2",
      typeName: "Server",
      pattern: null,
      measured: 1,
      compliant: 1,
      nonCompliant: 0,
      noHostname: 0,
      rate: 1,
      nonCompliantAssets: [],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  global.URL.createObjectURL = vi.fn(() => "blob:x");
  global.URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

describe("HostnameComplianceClient", () => {
  it("renders the overall rate and per-type rates", () => {
    render(<HostnameComplianceClient result={RESULT} />);
    expect(screen.getByText("66.7%")).toBeInTheDocument(); // overall
    expect(screen.getByText("50.0%")).toBeInTheDocument(); // Web
    expect(screen.getByText("100.0%")).toBeInTheDocument(); // Server
    expect(screen.getByText("Web")).toBeInTheDocument();
    expect(screen.getByText("fqdnFallback")).toBeInTheDocument(); // pattern-less type
  });

  it("hides non-compliant hosts until the row is expanded", async () => {
    const user = userEvent.setup();
    render(<HostnameComplianceClient result={RESULT} />);
    expect(screen.queryByText("bad-host")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Web/ }));
    expect(screen.getByText("bad-host")).toBeInTheDocument();
    expect(screen.getByText("Campus A - Room 1")).toBeInTheDocument();
  });

  it("downloads the non-compliant CSV from the export endpoint", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["csv"]),
    } as never);

    render(<HostnameComplianceClient result={RESULT} />);
    await user.click(screen.getByRole("button", { name: "exportNonCompliant" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/compliance/hostname/export")
    );
  });

  it("toasts an error when the export request fails", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as never);

    render(<HostnameComplianceClient result={RESULT} />);
    await user.click(screen.getByRole("button", { name: "exportNonCompliant" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }))
    );
  });

  it("expands non-compliant hosts via the keyboard", async () => {
    const user = userEvent.setup();
    render(<HostnameComplianceClient result={RESULT} />);
    const row = screen.getByRole("button", { name: /Web/ });
    row.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("bad-host")).toBeInTheDocument();
  });

  it("renders a not-applicable rate and empty state", () => {
    const nullRateResult: HostnameComplianceResult = {
      overall: { measured: 0, compliant: 0, nonCompliant: 0, rate: null },
      types: [
        {
          typeId: "t3",
          typeName: "Projector",
          pattern: null,
          measured: 0,
          compliant: 0,
          nonCompliant: 0,
          noHostname: 2,
          rate: null,
          nonCompliantAssets: [],
        },
      ],
    };
    render(<HostnameComplianceClient result={nullRateResult} />);
    // Overall + the Projector row both show the n/a marker.
    expect(screen.getAllByText("notApplicable").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the empty-state row when there are no types", () => {
    const empty: HostnameComplianceResult = {
      overall: { measured: 0, compliant: 0, nonCompliant: 0, rate: null },
      types: [],
    };
    render(<HostnameComplianceClient result={empty} />);
    expect(screen.getByText("noData")).toBeInTheDocument();
  });
});
