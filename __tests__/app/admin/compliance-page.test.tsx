import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/compliance/nis2", () => ({ computeNis2Compliance: vi.fn() }));
vi.mock("@/lib/compliance/hostname-report", () => ({ computeHostnameCompliance: vi.fn() }));
vi.mock("@/components/admin/compliance/nis2-dashboard-client", () => ({ Nis2DashboardClient: vi.fn(() => null) }));
vi.mock("@/components/admin/compliance/hostname-compliance-client", () => ({ HostnameComplianceClient: vi.fn(() => null) }));

import CompliancePage from "@/app/(dashboard)/admin/compliance/page";
import { auth } from "@/lib/auth";
import { computeNis2Compliance } from "@/lib/compliance/nis2";
import { computeHostnameCompliance } from "@/lib/compliance/hostname-report";
import { Nis2DashboardClient } from "@/components/admin/compliance/nis2-dashboard-client";
import { HostnameComplianceClient } from "@/components/admin/compliance/hostname-compliance-client";
import { NON_ADMIN_ROLES, propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin/compliance page", () => {
  it("redirects an unauthenticated visitor to / without computing reports", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(CompliancePage()).rejects.toThrow("REDIRECT:/");
    expect(computeNis2Compliance).not.toHaveBeenCalled();
    expect(computeHostnameCompliance).not.toHaveBeenCalled();
  });

  it.each(NON_ADMIN_ROLES)("redirects a %s to / without computing reports", async (role) => {
    mockAuth.mockResolvedValue(session(role) as never);
    await expect(CompliancePage()).rejects.toThrow("REDIRECT:/");
    expect(computeNis2Compliance).not.toHaveBeenCalled();
    expect(computeHostnameCompliance).not.toHaveBeenCalled();
  });

  it("passes both reports to their clients for an admin", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    const nis2 = { score: 1 };
    const hostname = { rows: [] };
    vi.mocked(computeNis2Compliance).mockResolvedValue(nis2 as never);
    vi.mocked(computeHostnameCompliance).mockResolvedValue(hostname as never);

    await renderPage(CompliancePage());

    expect(propsOf(Nis2DashboardClient)).toEqual({ result: nis2 });
    expect(propsOf(HostnameComplianceClient)).toEqual({ result: hostname });
  });
});
