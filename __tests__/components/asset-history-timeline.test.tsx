import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

import { AssetHistoryTimeline, historyLabelKey, type AuditLogEntry } from "@/components/assets/asset-history-timeline";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("historyLabelKey", () => {
  function entry(overrides: Partial<AuditLogEntry>): AuditLogEntry {
    return {
      id: "log1",
      timestamp: "2026-01-01T00:00:00.000Z",
      userEmail: "a@b.com",
      action: "CREATE",
      entityType: "Asset",
      detail: null,
      ...overrides,
    };
  }

  it("Asset CREATE with no snapshot marker -> created", () => {
    expect(historyLabelKey(entry({ action: "CREATE", detail: JSON.stringify({ snapshot: { Model: "X" } }) }))).toBe("created");
  });

  it("Asset CREATE deployed from stock -> deployedFromStock", () => {
    expect(
      historyLabelKey(entry({ action: "CREATE", detail: JSON.stringify({ snapshot: { "Deployed from stock": "X" } }) }))
    ).toBe("deployedFromStock");
  });

  it("Asset UPDATE with status DECOMMISSIONED -> decommissioned", () => {
    expect(historyLabelKey(entry({ action: "UPDATE", detail: JSON.stringify({ status: "DECOMMISSIONED" }) }))).toBe("decommissioned");
  });

  it("Asset UPDATE with status IN_REPAIR -> sentForRepair", () => {
    expect(historyLabelKey(entry({ action: "UPDATE", detail: JSON.stringify({ status: "IN_REPAIR" }) }))).toBe("sentForRepair");
  });

  it("Asset UPDATE with status INSTALLED -> reinstated", () => {
    expect(historyLabelKey(entry({ action: "UPDATE", detail: JSON.stringify({ status: "INSTALLED" }) }))).toBe("reinstated");
  });

  it("Asset UPDATE with no status -> edited", () => {
    expect(historyLabelKey(entry({ action: "UPDATE", detail: JSON.stringify({ changes: { Model: {} } }) }))).toBe("edited");
  });

  it("Asset DELETE returned to stock -> returnedToStock", () => {
    expect(
      historyLabelKey(entry({ action: "DELETE", detail: JSON.stringify({ snapshot: { "Returned to stock": "X" } }) }))
    ).toBe("returnedToStock");
  });

  it("Asset DELETE plain -> deleted", () => {
    expect(historyLabelKey(entry({ action: "DELETE", detail: JSON.stringify({ snapshot: { Model: "X" } }) }))).toBe("deleted");
  });

  it("StockItem CREATE returned from asset -> returnedToStock", () => {
    expect(
      historyLabelKey(
        entry({ entityType: "StockItem", action: "CREATE", detail: JSON.stringify({ snapshot: { "Returned from asset at": "X" } }) })
      )
    ).toBe("returnedToStock");
  });

  it("StockItem CREATE plain -> addedToStock", () => {
    expect(
      historyLabelKey(entry({ entityType: "StockItem", action: "CREATE", detail: JSON.stringify({ snapshot: { Model: "X" } }) }))
    ).toBe("addedToStock");
  });

  it("StockItem UPDATE with deployed quantity -> partiallyDeployed", () => {
    expect(
      historyLabelKey(
        entry({ entityType: "StockItem", action: "UPDATE", detail: JSON.stringify({ snapshot: { "Deployed quantity": "2" } }) })
      )
    ).toBe("partiallyDeployed");
  });

  it("StockItem UPDATE with a Location change -> relocated", () => {
    expect(
      historyLabelKey(
        entry({ entityType: "StockItem", action: "UPDATE", detail: JSON.stringify({ changes: { Location: {} } }) })
      )
    ).toBe("relocated");
  });

  it("StockItem UPDATE plain -> edited", () => {
    expect(
      historyLabelKey(entry({ entityType: "StockItem", action: "UPDATE", detail: JSON.stringify({ changes: { Model: {} } }) }))
    ).toBe("edited");
  });

  it("StockItem DELETE fully deployed -> fullyDeployed", () => {
    expect(
      historyLabelKey(
        entry({ entityType: "StockItem", action: "DELETE", detail: JSON.stringify({ snapshot: { "Deployed quantity": "10" } }) })
      )
    ).toBe("fullyDeployed");
  });

  it("StockItem DELETE plain -> deleted", () => {
    expect(historyLabelKey(entry({ entityType: "StockItem", action: "DELETE", detail: null }))).toBe("deleted");
  });
});

describe("<AssetHistoryTimeline />", () => {
  it("shows a loading state, then the resolved entries", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "log1", timestamp: "2026-01-01T00:00:00.000Z", userEmail: "a@b.com", action: "CREATE", entityType: "Asset", detail: null },
      ],
    });
    render(<AssetHistoryTimeline assetId="a1" />);
    expect(screen.getByText("loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("created")).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledWith("/api/assets/a1/history");
  });

  it("shows an empty state when there is no history", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    render(<AssetHistoryTimeline assetId="a1" />);
    await waitFor(() => expect(screen.getByText("empty")).toBeInTheDocument());
  });

  it("shows an error state when the request fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<AssetHistoryTimeline assetId="a1" />);
    await waitFor(() => expect(screen.getByText("error")).toBeInTheDocument());
  });
});
