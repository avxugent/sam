import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string, values: { code: (chunks: ReactNode) => ReactNode }) => values.code(key);
    return t;
  },
}));
const mockToast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { ExportClient } from "@/components/admin/data/export-client";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const json = (body: unknown, ok = true, status = ok ? 200 : 400) => ({ ok, status, json: async () => body }) as Response;
const blobResponse = () => ({ ok: true, status: 200, blob: async () => new Blob(["a,b"]) }) as Response;

const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

function renderClient() {
  return render(<ExportClient initialCronExpression="0 2 * * *" initialOutputDir="/backups" initialEnabled={false} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ExportClient", () => {
  it.each([
    ["downloadCsv", "/api/export/csv", "sam-export-2026-10-31.csv"],
    ["downloadDecommissioned", "/api/export/decommissioned", "sam-decommissioned-2026-10-31.csv"],
    ["downloadStock", "/api/export/stock", "sam-stock-2026-10-31.csv"],
  ])("%s downloads %s as a dated file", async (button, endpoint, filename) => {
    mockFetch.mockResolvedValueOnce(blobResponse());
    renderClient();
    await userEvent.click(screen.getByRole("button", { name: button }));
    expect(mockFetch).toHaveBeenCalledWith(endpoint);
    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe(filename);
    expect(mockToast).toHaveBeenCalledWith({ title: "exportComplete" });
  });

  it("disables every download button while one is running", async () => {
    let resolve!: (r: Response) => void;
    mockFetch.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    renderClient();
    await userEvent.click(screen.getByRole("button", { name: "downloadStock" }));
    for (const name of ["downloadCsv", "downloadDecommissioned", "downloadStock"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    resolve(blobResponse());
    expect(await screen.findByRole("button", { name: "downloadCsv" })).toBeEnabled();
  });

  it("toasts an error when the download is refused", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Forbidden" }, false, 403));
    renderClient();
    await userEvent.click(screen.getByRole("button", { name: "downloadCsv" }));
    expect(mockToast).toHaveBeenCalledWith({ title: "error", variant: "destructive" });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("shows the cron hint and setup commands built from the current schedule", async () => {
    renderClient();
    expect(screen.getByText("scheduleCronExample")).toBeInTheDocument();
    expect(screen.getByText("setupOptionHttp")).toBeInTheDocument();
    const cron = screen.getByLabelText("scheduleCron");
    await userEvent.clear(cron);
    await userEvent.type(cron, "30 4 * * 1");
    const dir = screen.getByLabelText("scheduleOutputDir");
    await userEvent.clear(dir);
    await userEvent.type(dir, "/mnt/out");
    expect(screen.getByText(/30 4 \* \* 1 curl -s/)).toHaveTextContent("> /mnt/out/sam-$(date +%Y%m%d).csv");
    expect(screen.getByText(/scripts\/export-backup\.mjs/)).toHaveTextContent(
      "30 4 * * 1 cd /app && node --import tsx/esm scripts/export-backup.mjs --output /mnt/out"
    );
  });

  it("saves the schedule with PUT and toasts success", async () => {
    mockFetch.mockResolvedValueOnce(json({}));
    renderClient();
    const cron = screen.getByLabelText("scheduleCron");
    await userEvent.clear(cron);
    await userEvent.type(cron, "0 3 * * *");
    await userEvent.click(screen.getByLabelText("scheduleShowActive"));
    await userEvent.click(screen.getByRole("button", { name: "saveSchedule" }));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/settings/export");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ cronExpression: "0 3 * * *", outputDir: "/backups", enabled: true });
    expect(mockToast).toHaveBeenCalledWith({ title: "scheduleSaved" });
  });

  it("disables the save button while saving", async () => {
    let resolve!: (r: Response) => void;
    mockFetch.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    renderClient();
    await userEvent.click(screen.getByRole("button", { name: "saveSchedule" }));
    expect(screen.getByRole("button", { name: "saveSchedule" })).toBeDisabled();
    resolve(json({}));
    expect(await screen.findByRole("button", { name: "saveSchedule" })).toBeEnabled();
  });

  it("toasts the server's error when saving the schedule fails", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Invalid cron" }, false));
    renderClient();
    await userEvent.click(screen.getByRole("button", { name: "saveSchedule" }));
    expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Invalid cron", variant: "destructive" });
    expect(mockToast).not.toHaveBeenCalledWith({ title: "scheduleSaved" });
  });
});
