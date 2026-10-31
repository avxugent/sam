import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const { mockToast, mockRefresh } = vi.hoisted(() => ({ mockToast: vi.fn(), mockRefresh: vi.fn() }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

import { BrandingSettingsClient } from "@/components/admin/settings/branding-settings-client";
import type { BackgroundMode } from "@/lib/branding/background-mode";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;
const json = (body: unknown, ok = true, status = ok ? 200 : 400) => ({ ok, status, json: async () => body }) as Response;

function renderBranding(overrides: Partial<{
  initialAppTitle: string;
  initialHasLogo: boolean;
  initialHasFavicon: boolean;
  initialBackgroundMode: BackgroundMode;
  initialHasCustomBackground: boolean;
}> = {}) {
  return render(
    <BrandingSettingsClient
      initialAppTitle="SAM"
      initialHasLogo={false}
      initialHasFavicon={false}
      initialBackgroundMode=""
      initialHasCustomBackground={false}
      {...overrides}
    />
  );
}

/** The hidden file inputs, in render order: logo, favicon, background. */
function fileInputs(container: HTMLElement) {
  const [logo, favicon, background] = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  return { logo, favicon, background };
}

const png = () => new File(["png"], "img.png", { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BrandingSettingsClient — app title", () => {
  it("saves the trimmed title and refreshes", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    renderBranding();
    const input = screen.getByLabelText("appTitle");
    await userEvent.clear(input);
    await userEvent.type(input, "  My Inventory  ");
    await userEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "saved" }));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/settings/branding");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ appTitle: "My Inventory" });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("disables save for a blank title", async () => {
    renderBranding();
    await userEvent.clear(screen.getByLabelText("appTitle"));
    await userEvent.type(screen.getByLabelText("appTitle"), "   ");
    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
  });

  it("toasts the API error and does not refresh", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Too long" }, false));
    renderBranding();
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Too long", variant: "destructive" })
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("BrandingSettingsClient — logo", () => {
  it("shows the placeholder and no remove button without a logo", () => {
    renderBranding();
    expect(screen.getByText("noLogoUploaded")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "removeLogo" })).not.toBeInTheDocument();
  });

  it("opens the file picker from the upload button", async () => {
    const { container } = renderBranding();
    const { logo } = fileInputs(container);
    const click = vi.spyOn(logo, "click");
    await userEvent.click(screen.getByRole("button", { name: "uploadLogo" }));
    expect(click).toHaveBeenCalled();
  });

  it("uploads a logo as multipart and shows the preview", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    const { container } = renderBranding();
    const file = png();
    await userEvent.upload(fileInputs(container).logo, file);

    expect(await screen.findByAltText("Logo")).toHaveAttribute("src", "/api/branding/logo?v=1");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/settings/branding/logo");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBe(file);
    expect(mockToast).toHaveBeenCalledWith({ title: "logoUploaded" });
    expect(mockRefresh).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "removeLogo" })).toBeInTheDocument();
  });

  it("toasts an upload failure and keeps the placeholder", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Bad type" }, false));
    const { container } = renderBranding();
    await userEvent.upload(fileInputs(container).logo, png());
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Bad type", variant: "destructive" })
    );
    expect(screen.getByText("noLogoUploaded")).toBeInTheDocument();
  });

  it("ignores a change event without a file", async () => {
    const { container } = renderBranding();
    const { logo } = fileInputs(container);
    logo.dispatchEvent(new Event("change", { bubbles: true }));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("removes the logo", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    renderBranding({ initialHasLogo: true });
    expect(screen.getByAltText("Logo")).toHaveAttribute("src", "/api/branding/logo?v=0");
    await userEvent.click(screen.getByRole("button", { name: "removeLogo" }));

    expect(await screen.findByText("noLogoUploaded")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("/api/settings/branding/logo", { method: "DELETE" });
    expect(mockToast).toHaveBeenCalledWith({ title: "logoRemoved" });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("keeps the logo when removal fails", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Nope" }, false));
    renderBranding({ initialHasLogo: true });
    await userEvent.click(screen.getByRole("button", { name: "removeLogo" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Nope", variant: "destructive" })
    );
    expect(screen.getByAltText("Logo")).toBeInTheDocument();
  });
});

describe("BrandingSettingsClient — favicon", () => {
  it("opens the file picker from the upload button", async () => {
    const { container } = renderBranding();
    const click = vi.spyOn(fileInputs(container).favicon, "click");
    await userEvent.click(screen.getByRole("button", { name: "uploadFavicon" }));
    expect(click).toHaveBeenCalled();
  });

  it("uploads a favicon", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    const { container } = renderBranding();
    const file = new File(["ico"], "favicon.png", { type: "image/png" });
    await userEvent.upload(fileInputs(container).favicon, file);

    expect(await screen.findByAltText("Favicon")).toHaveAttribute("src", "/api/branding/favicon?v=1");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/settings/branding/favicon");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBe(file);
    expect(mockToast).toHaveBeenCalledWith({ title: "faviconUploaded" });
  });

  it("toasts a favicon upload failure", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Too big" }, false));
    const { container } = renderBranding();
    await userEvent.upload(fileInputs(container).favicon, png());
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Too big", variant: "destructive" })
    );
    expect(screen.getByText("noFaviconUploaded")).toBeInTheDocument();
  });

  it("ignores a favicon change event without a file", () => {
    const { container } = renderBranding();
    fileInputs(container).favicon.dispatchEvent(new Event("change", { bubbles: true }));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("removes the favicon", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    renderBranding({ initialHasFavicon: true });
    await userEvent.click(screen.getByRole("button", { name: "removeFavicon" }));
    expect(await screen.findByText("noFaviconUploaded")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("/api/settings/branding/favicon", { method: "DELETE" });
    expect(mockToast).toHaveBeenCalledWith({ title: "faviconRemoved" });
  });

  it("keeps the favicon when removal fails", async () => {
    mockFetch.mockResolvedValueOnce(json({}, false, 500));
    renderBranding({ initialHasFavicon: true });
    await userEvent.click(screen.getByRole("button", { name: "removeFavicon" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "somethingWentWrong", variant: "destructive" })
    );
    expect(screen.getByAltText("Favicon")).toBeInTheDocument();
  });
});

describe("BrandingSettingsClient — background", () => {
  it("saves a preset mode", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    renderBranding();
    await userEvent.click(screen.getByRole("button", { name: "backgroundPresetTesting" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "saved" }));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/settings/branding");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ backgroundMode: "preset:testing" });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("switches from custom back to none, hiding the custom section", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    renderBranding({ initialBackgroundMode: "custom", initialHasCustomBackground: true });
    expect(screen.getByAltText("Background")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "backgroundNone" }));
    await waitFor(() => expect(screen.queryByAltText("Background")).not.toBeInTheDocument());
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ backgroundMode: "" });
  });

  it("toasts a failed mode save and keeps the old mode", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Invalid input", details: ["bad mode"] }, false));
    renderBranding({ initialBackgroundMode: "custom", initialHasCustomBackground: true });
    await userEvent.click(screen.getByRole("button", { name: "backgroundPresetTesting" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({
        title: "error",
        description: "Invalid input: bad mode",
        variant: "destructive",
      })
    );
    expect(screen.getByAltText("Background")).toBeInTheDocument();
  });

  it("choosing custom opens the file picker without calling the API", async () => {
    const { container } = renderBranding();
    const click = vi.spyOn(fileInputs(container).background, "click");
    await userEvent.click(screen.getByRole("button", { name: "backgroundCustom" }));
    expect(click).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uploads a background, switching to custom mode with a preview", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    const { container } = renderBranding();
    const file = png();
    await userEvent.upload(fileInputs(container).background, file);

    expect(await screen.findByAltText("Background")).toHaveAttribute("src", "/api/branding/background?v=1");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/settings/branding/background");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBe(file);
    expect(mockToast).toHaveBeenCalledWith({ title: "backgroundUploaded" });
    expect(screen.getByRole("button", { name: "removeBackground" })).toBeInTheDocument();
  });

  it("toasts a background upload failure", async () => {
    mockFetch.mockResolvedValueOnce(json({ error: "Bad image" }, false));
    const { container } = renderBranding();
    await userEvent.upload(fileInputs(container).background, png());
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Bad image", variant: "destructive" })
    );
    expect(screen.queryByAltText("Background")).not.toBeInTheDocument();
  });

  it("ignores a background change event without a file", () => {
    const { container } = renderBranding();
    fileInputs(container).background.dispatchEvent(new Event("change", { bubbles: true }));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows the empty custom state with an upload button when no image exists", async () => {
    const { container } = renderBranding({ initialBackgroundMode: "custom", initialHasCustomBackground: false });
    expect(screen.getByText("noBackgroundUploaded")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "removeBackground" })).not.toBeInTheDocument();
    const click = vi.spyOn(fileInputs(container).background, "click");
    await userEvent.click(screen.getByRole("button", { name: "uploadBackground" }));
    expect(click).toHaveBeenCalled();
  });

  it("replace button on an existing background opens the file picker", async () => {
    const { container } = renderBranding({ initialBackgroundMode: "custom", initialHasCustomBackground: true });
    const click = vi.spyOn(fileInputs(container).background, "click");
    await userEvent.click(screen.getByRole("button", { name: "uploadBackground" }));
    expect(click).toHaveBeenCalled();
  });

  it("removes the background and resets the mode to none", async () => {
    mockFetch.mockResolvedValueOnce(json({ ok: true }));
    renderBranding({ initialBackgroundMode: "custom", initialHasCustomBackground: true });
    await userEvent.click(screen.getByRole("button", { name: "removeBackground" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "backgroundRemoved" }));
    expect(mockFetch).toHaveBeenCalledWith("/api/settings/branding/background", { method: "DELETE" });
    expect(screen.queryByAltText("Background")).not.toBeInTheDocument();
    expect(screen.queryByText("noBackgroundUploaded")).not.toBeInTheDocument();
  });

  it("keeps the background when removal fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));
    renderBranding({ initialBackgroundMode: "custom", initialHasCustomBackground: true });
    await userEvent.click(screen.getByRole("button", { name: "removeBackground" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "somethingWentWrong", variant: "destructive" })
    );
    expect(screen.getByAltText("Background")).toBeInTheDocument();
  });
});
