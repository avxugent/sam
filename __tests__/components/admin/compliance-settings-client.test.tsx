import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { ComplianceSettingsClient } from "@/components/admin/compliance-settings-client";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const json = (body: unknown, ok = true, status = ok ? 200 : 400) => ({ ok, status, json: async () => body }) as Response;

const USERS = [{ id: "u1", name: "Ada Admin" }, { id: "u2", name: "Vic Viewer" }];
const ITEMS = [{ id: "w1", name: "Annual review" }];

function renderClient(overrides: Partial<Parameters<typeof ComplianceSettingsClient>[0]> = {}) {
  return render(
    <ComplianceSettingsClient
      initialRequireTwoFactor={false}
      initialAuditRetentionDays={365}
      initialDefaultOwnerId={null}
      initialReviewWorkLogItemId={null}
      initialReviewPeriodMonths={12}
      users={USERS}
      workLogItems={ITEMS}
      {...overrides}
    />
  );
}

async function setNumber(label: string, value: string) {
  const input = screen.getByLabelText(label);
  await userEvent.clear(input);
  if (value) await userEvent.type(input, value);
}

const save = () => userEvent.click(screen.getByRole("button", { name: "save" }));
const body = () => JSON.parse(mockFetch.mock.calls[0][1].body);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ComplianceSettingsClient", () => {
  it("shows the initial values", () => {
    renderClient({ initialRequireTwoFactor: true, initialDefaultOwnerId: "u2", initialReviewWorkLogItemId: "w1" });
    expect(screen.getByRole("checkbox", { name: "complianceRequire2fa" })).toBeChecked();
    expect(screen.getByLabelText("complianceRetention")).toHaveValue(365);
    expect(screen.getByLabelText("complianceReviewPeriod")).toHaveValue(12);
    expect(screen.getByLabelText("complianceDefaultOwner")).toHaveValue("u2");
    expect(screen.getByLabelText("complianceReviewItem")).toHaveValue("w1");
  });

  it("sends unchanged defaults with empty selections as null", async () => {
    mockFetch.mockResolvedValueOnce(json({}));
    renderClient();
    await save();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/settings/compliance");
    expect(init.method).toBe("PUT");
    expect(body()).toEqual({
      requireTwoFactor: false,
      auditRetentionDays: 365,
      defaultOwnerId: null,
      reviewWorkLogItemId: null,
      reviewPeriodMonths: 12,
    });
    expect(mockToast).toHaveBeenCalledWith({ title: "saved" });
  });

  it("saves changed toggles, numbers and selections", async () => {
    mockFetch.mockResolvedValueOnce(json({}));
    renderClient();
    await userEvent.click(screen.getByRole("checkbox", { name: "complianceRequire2fa" }));
    await setNumber("complianceRetention", "90");
    await setNumber("complianceReviewPeriod", "6");
    await userEvent.selectOptions(screen.getByLabelText("complianceDefaultOwner"), "Ada Admin");
    await userEvent.selectOptions(screen.getByLabelText("complianceReviewItem"), "Annual review");
    await save();
    expect(body()).toEqual({
      requireTwoFactor: true,
      auditRetentionDays: 90,
      defaultOwnerId: "u1",
      reviewWorkLogItemId: "w1",
      reviewPeriodMonths: 6,
    });
  });

  it("clears a selected owner back to null", async () => {
    mockFetch.mockResolvedValueOnce(json({}));
    renderClient({ initialDefaultOwnerId: "u1", initialRequireTwoFactor: true });
    await userEvent.selectOptions(screen.getByLabelText("complianceDefaultOwner"), "complianceDefaultOwnerNone");
    await userEvent.click(screen.getByRole("checkbox", { name: "complianceRequire2fa" }));
    await save();
    expect(body()).toMatchObject({ defaultOwnerId: null, requireTwoFactor: false });
  });

  it.each(["", "29", "3651"])("rejects audit retention %j without calling the API", async (value) => {
    renderClient();
    await setNumber("complianceRetention", value);
    await save();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "complianceRetentionInvalid", variant: "destructive" });
  });

  it.each(["", "0", "121"])("rejects review period %j without calling the API", async (value) => {
    renderClient();
    await setNumber("complianceReviewPeriod", value);
    await save();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "complianceReviewPeriodInvalid", variant: "destructive" });
  });

  it("accepts the boundary values", async () => {
    mockFetch.mockResolvedValueOnce(json({}));
    renderClient();
    await setNumber("complianceRetention", "3650");
    await setNumber("complianceReviewPeriod", "120");
    await save();
    expect(body()).toMatchObject({ auditRetentionDays: 3650, reviewPeriodMonths: 120 });
  });

  it("shows the saving state while the request is in flight", async () => {
    let resolve!: (r: Response) => void;
    mockFetch.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    renderClient();
    await save();
    expect(screen.getByRole("button", { name: "saving" })).toBeDisabled();
    resolve(json({}));
    expect(await screen.findByRole("button", { name: "save" })).toBeEnabled();
  });

  it("toasts the server error when saving fails", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Unknown user" }, false));
    renderClient();
    await save();
    expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Unknown user", variant: "destructive" });
  });
});
