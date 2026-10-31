import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { GeneralSettingsClient } from "@/components/admin/settings/general-settings-client";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const json = (body: unknown, ok = true, status = ok ? 200 : 400) => ({ ok, status, json: async () => body }) as Response;

function renderClient(overrides: Partial<Parameters<typeof GeneralSettingsClient>[0]> = {}) {
  return render(
    <GeneralSettingsClient
      initialHostnameUrlTemplate=""
      initialMacAddressUrlTemplate=""
      initialLocationUrlTemplate=""
      {...overrides}
    />
  );
}

async function setTemplate(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement;
  await userEvent.clear(input);
  input.focus();
  await userEvent.paste(value);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GeneralSettingsClient", () => {
  it("shows no previews when every template is empty", () => {
    renderClient();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/Preview/)).not.toBeInTheDocument();
  });

  it("renders previews of the initial templates with example values", () => {
    renderClient({
      initialHostnameUrlTemplate: "https://h.example/{hostname}/{serial}/{model}/{manufacturer}",
      initialMacAddressUrlTemplate: "https://m.example/{mac}/{mac_plain}/{mac_dash}",
      initialLocationUrlTemplate: "https://l.example/{fi_number}/{location_id}",
    });
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://h.example/pc-example-01/SN123456/OptiPlex 7090/Dell",
      "https://m.example/aa:bb:cc:dd:ee:ff/aabbccddeeff/aa-bb-cc-dd-ee-ff",
      "https://l.example/14.10.100.013/clx0example000",
    ]);
    links.forEach((a) => {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  it("updates the preview live as a template is typed", async () => {
    renderClient();
    await setTemplate("location-template", "https://l.example/{location_name}");
    expect(screen.getByRole("link", { name: /Room 013/ })).toHaveAttribute("href", "https://l.example/Room 013");
    await setTemplate("location-template", "");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("saves all three templates with PUT and toasts success", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    renderClient({ initialHostnameUrlTemplate: "https://old/{hostname}" });
    await setTemplate("hostname-template", "https://h/{hostname}");
    await setTemplate("mac-template", "https://m/{mac}");
    await setTemplate("location-template", "https://l/{fi_number}");
    await userEvent.click(screen.getByRole("button", { name: "save" }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/settings/general");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      hostnameUrlTemplate: "https://h/{hostname}",
      macAddressUrlTemplate: "https://m/{mac}",
      locationUrlTemplate: "https://l/{fi_number}",
    });
    expect(mockToast).toHaveBeenCalledWith({ title: "saved" });
  });

  it("shows the saving state while the request is in flight", async () => {
    let resolve!: (r: Response) => void;
    mockFetch.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    renderClient();
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    expect(screen.getByRole("button", { name: "saving" })).toBeDisabled();
    resolve(json({}));
    expect(await screen.findByRole("button", { name: "save" })).toBeEnabled();
  });

  it("toasts the server error when saving fails", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Invalid template" }, false));
    renderClient();
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Invalid template", variant: "destructive" });
    expect(mockToast).not.toHaveBeenCalledWith({ title: "saved" });
  });
});
