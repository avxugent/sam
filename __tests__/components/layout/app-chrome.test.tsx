import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useLocale: vi.fn(() => "en"),
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/app/actions/locale", () => ({ setLocale: vi.fn() }));

import { useLocale } from "next-intl";
import { setLocale } from "@/app/actions/locale";
import { AppBackground } from "@/components/layout/app-background";
import { AppFooter } from "@/components/layout/app-footer";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

const mockUseLocale = vi.mocked(useLocale);
const mockSetLocale = vi.mocked(setLocale);

afterEach(() => {
  vi.useRealTimers();
  mockUseLocale.mockReturnValue("en");
  mockSetLocale.mockReset();
});

describe("AppBackground", () => {
  it("renders nothing without a background mode", () => {
    const { container } = render(<AppBackground backgroundMode="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("tiles the uploaded background in custom mode", () => {
    const { container } = render(<AppBackground backgroundMode="custom" />);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer.style.backgroundImage).toContain("/api/branding/background");
    expect(layer.style.pointerEvents).toBe("none");
  });

  it("uses the TESTING watermark for the testing preset", () => {
    const { container } = render(<AppBackground backgroundMode="preset:testing" />);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer.style.backgroundImage).toContain("data:image/svg+xml");
    expect(decodeURIComponent(layer.style.backgroundImage)).toContain("TESTING");
  });
});

describe("AppFooter", () => {
  it("shows the version and a clock that ticks every second", () => {
    vi.useFakeTimers();
    const start = new Date(2026, 10, 5, 9, 30, 15);
    vi.setSystemTime(start);
    render(<AppFooter version="1.2.3" />);

    expect(screen.getByText("v1.2.3")).toBeInTheDocument();
    const time = (d: Date) => d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const date = start.toLocaleDateString("en", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
    expect(screen.getByText(`${date} · ${time(start)}`)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(`${date} · ${time(new Date(start.getTime() + 1000))}`)).toBeInTheDocument();
  });

  it("formats in the active locale", () => {
    mockUseLocale.mockReturnValue("nl");
    vi.useFakeTimers();
    const start = new Date(2026, 10, 5, 9, 30, 15);
    vi.setSystemTime(start);
    render(<AppFooter version="1.0.0" />);
    const date = start.toLocaleDateString("nl", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
    expect(screen.getByText(new RegExp(`^${date} · `))).toBeInTheDocument();
  });

  it("stops the clock when unmounted", () => {
    vi.useFakeTimers();
    const { unmount } = render(<AppFooter version="1.0.0" />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("LanguageSwitcher", () => {
  it("shows the current locale and lists every language, marking the current one", async () => {
    render(<LanguageSwitcher />);
    const trigger = screen.getByRole("button", { name: "language" });
    expect(trigger).toHaveTextContent("en");
    await userEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: "English" })).toHaveClass("font-medium");
    expect(screen.getByRole("menuitem", { name: "Nederlands" })).not.toHaveClass("font-medium");
  });

  it("switching calls the locale server action", async () => {
    mockSetLocale.mockResolvedValue(undefined);
    render(<LanguageSwitcher />);
    await userEvent.click(screen.getByRole("button", { name: "language" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Nederlands" }));
    expect(mockSetLocale).toHaveBeenCalledWith("nl");
  });

  it("does nothing when the current language is picked", async () => {
    render(<LanguageSwitcher />);
    await userEvent.click(screen.getByRole("button", { name: "language" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "English" }));
    expect(mockSetLocale).not.toHaveBeenCalled();
  });

  it("disables the trigger while the switch is pending", async () => {
    let finish: () => void = () => {};
    mockSetLocale.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<LanguageSwitcher />);
    const trigger = screen.getByRole("button", { name: "language" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Nederlands" }));
    expect(trigger).toBeDisabled();

    await act(async () => finish());
    expect(trigger).toBeEnabled();
  });
});
