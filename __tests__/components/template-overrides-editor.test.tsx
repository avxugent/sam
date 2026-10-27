import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock("@/components/admin/scrape-template-fields", () => ({
  ScrapeTemplateFields: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="template" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { TemplateOverridesEditor } from "@/components/admin/template-overrides-editor";

const manufacturers = [
  { id: "m1", name: "Dell" },
  { id: "m2", name: "HP" },
];
const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TemplateOverridesEditor", () => {
  it("lists manufacturer overrides and offers only manufacturers without one", async () => {
    mockFetch.mockResolvedValueOnce(json([{ id: "o1", manufacturerId: "m1", manufacturerName: "Dell", scrapeTargetTemplate: "a=b" }]));
    render(<TemplateOverridesEditor kind="manufacturer" assetTypeId="t1" manufacturers={manufacturers} />);
    expect(await screen.findByText("Dell")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("/api/asset-types/t1/manufacturer-templates");

    await userEvent.click(screen.getByRole("button", { name: /addOverride/ }));
    const select = screen.getByLabelText("selectManufacturer");
    expect([...(select as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["HP"]);
  });

  it("creates a model override with the trimmed model name", async () => {
    mockFetch.mockResolvedValueOnce(json([]));
    render(<TemplateOverridesEditor kind="model" assetTypeId="t1" manufacturers={manufacturers} />);
    await screen.findByText("noModelOverridesYet");

    await userEvent.click(screen.getByRole("button", { name: /addOverride/ }));
    await userEvent.type(screen.getByLabelText("model"), "  XPS 13 ");
    await userEvent.type(screen.getByLabelText("template"), "__address__=x");
    mockFetch.mockResolvedValueOnce(
      json({ id: "o2", manufacturerId: "m1", manufacturerName: "Dell", model: "XPS 13", scrapeTargetTemplate: "__address__=x" })
    );
    await userEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "modelOverrideAdded" }));
    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe("/api/asset-types/t1/model-templates");
    expect(JSON.parse(init.body)).toEqual({ manufacturerId: "m1", model: "XPS 13", scrapeTargetTemplate: "__address__=x" });
    expect(screen.getByText("Dell — XPS 13")).toBeInTheDocument();
  });

  it("shows API details when saving fails", async () => {
    mockFetch.mockResolvedValueOnce(json([{ id: "o1", manufacturerId: "m1", manufacturerName: "Dell", scrapeTargetTemplate: "a=b" }]));
    render(<TemplateOverridesEditor kind="manufacturer" assetTypeId="t1" manufacturers={manufacturers} />);
    await userEvent.click(await screen.findByRole("button", { name: "editOverrideFor" }));
    mockFetch.mockResolvedValueOnce(json({ error: "Template syntax error", details: ["Line 1: bad"] }, false));
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Template syntax error: Line 1: bad" }))
    );
  });
});
