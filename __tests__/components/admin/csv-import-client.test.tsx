import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key);
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { CsvImportClient } from "@/components/admin/csv-import-client";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const PREVIEW = { totalRows: 2, columns: ["LOKAAL", "SERIAL", "WHATEVER"], preview: [{ LOKAAL: "Room 1", SERIAL: "SN1", WHATEVER: "x" }] };

async function chooseFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File(["LOKAAL;SERIAL\nRoom 1;SN1"], "assets.csv", { type: "text/csv" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CsvImportClient", () => {
  it("previews the file without importing it", async () => {
    mockFetch.mockResolvedValueOnce(json(PREVIEW));
    const { container } = render(<CsvImportClient />);
    await chooseFile(container);

    expect(await screen.findByText(/detectedRows/)).toHaveTextContent('detectedRows:{"rows":2,"cols":3}');
    expect(screen.getByText("Room 1")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/import/preview");
  });

  it("imports after the preview and shows the result", async () => {
    mockFetch
      .mockResolvedValueOnce(json(PREVIEW))
      .mockResolvedValueOnce(json({ ok: true, created: 1, skipped: 1, errors: ["Row 3: LOKAAL is required"] }));
    const { container } = render(<CsvImportClient />);
    await chooseFile(container);
    await userEvent.click(await screen.findByRole("button", { name: /importRows/ }));

    expect(await screen.findByText("completeTitle")).toBeInTheDocument();
    expect(mockFetch.mock.calls[1][0]).toBe("/api/import");
    expect(mockToast).toHaveBeenCalledWith({ title: 'assetsCreated:{"count":1}' });
    await userEvent.click(screen.getByRole("button", { name: /errorsCount/ }));
    expect(screen.getByText("Row 3: LOKAAL is required")).toBeInTheDocument();
  });

  it("toasts the API error when the preview fails", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Only CSV files are accepted." }, 400));
    const { container } = render(<CsvImportClient />);
    await chooseFile(container);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "previewFailed", description: "Only CSV files are accepted." }))
    );
    expect(screen.queryByRole("button", { name: /importRows/ })).not.toBeInTheDocument();
  });

  it("toasts a failed import, even without a JSON body", async () => {
    mockFetch.mockResolvedValueOnce(json(PREVIEW)).mockResolvedValueOnce(new Response("boom", { status: 500 }));
    const { container } = render(<CsvImportClient />);
    await chooseFile(container);
    await userEvent.click(await screen.findByRole("button", { name: /importRows/ }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "importFailed" })));
    expect(screen.queryByText("completeTitle")).not.toBeInTheDocument();
  });

  it("removing the file clears the preview", async () => {
    mockFetch.mockResolvedValueOnce(json(PREVIEW));
    const { container } = render(<CsvImportClient />);
    await chooseFile(container);
    await screen.findByText(/detectedRows/);
    await userEvent.click(screen.getByRole("button", { name: "removeFile" }));
    expect(screen.queryByText(/detectedRows/)).not.toBeInTheDocument();
  });
});
