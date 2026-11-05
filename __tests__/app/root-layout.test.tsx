import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  getLocale: vi.fn(async () => "nl"),
  getMessages: vi.fn(async () => ({})),
}));
vi.mock("next-intl", () => ({ NextIntlClientProvider: vi.fn(() => null) }));
vi.mock("@/lib/app-settings", () => ({ readBrandingSettings: vi.fn() }));
vi.mock("@/components/ui/toaster", () => ({ Toaster: vi.fn(() => null) }));
vi.mock("@/components/layout/theme-provider", () => ({ ThemeProvider: vi.fn(() => null) }));
vi.mock("@/components/layout/app-background", () => ({ AppBackground: vi.fn(() => null) }));

import RootLayout, { generateMetadata } from "@/app/layout";
import { readBrandingSettings } from "@/lib/app-settings";
import { AppBackground } from "@/components/layout/app-background";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("root layout", () => {
  it("builds the title template from the app title and links the custom favicon", async () => {
    vi.mocked(readBrandingSettings).mockResolvedValue({ appTitle: "Lab Inventory", hasFavicon: true } as never);
    expect(await generateMetadata()).toEqual({
      title: { default: "Lab Inventory – Simple Asset Management", template: "%s – Lab Inventory" },
      description: "appDescription",
      icons: [{ rel: "icon", url: "/api/branding/favicon" }],
    });
  });

  it("omits icons when no favicon is uploaded", async () => {
    vi.mocked(readBrandingSettings).mockResolvedValue({ appTitle: "SAM", hasFavicon: false } as never);
    expect(await generateMetadata()).not.toHaveProperty("icons");
  });

  it("sets the document language from the active locale and passes the background mode", async () => {
    vi.mocked(readBrandingSettings).mockResolvedValue({ backgroundMode: "image" } as never);
    // <html> cannot be rendered inside the test container: inspect the element tree instead.
    const html = (await RootLayout({ children: null })) as ReactElement<{ lang: string; children: ReactElement<{ children: ReactElement[] }> }>;
    expect(html.type).toBe("html");
    expect(html.props.lang).toBe("nl");
    const background = html.props.children.props.children.find((el) => el.type === AppBackground);
    expect(background?.props).toEqual({ backgroundMode: "image" });
  });
});
