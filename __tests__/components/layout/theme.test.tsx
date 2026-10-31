import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "@/components/layout/theme-provider";
import { ThemeSync } from "@/components/layout/theme-sync";

function setMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as never;
}

function Consumer() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme("dark")}>dark</button>
      <button onClick={() => setTheme("system")}>system</button>
      <button onClick={() => setTheme("light")}>light</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  setMatchMedia(false);
});
afterEach(() => vi.clearAllMocks());

describe("useTheme()", () => {
  it("returns context defaults outside a ThemeProvider", () => {
    render(<Consumer />);
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });
});

describe("<ThemeProvider />", () => {
  it("adopts the persisted theme on mount", () => {
    localStorage.setItem("sam-theme", "dark");
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("defaults to light when no preference is stored", () => {
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists and applies a theme via setTheme", async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    await user.click(screen.getByRole("button", { name: "dark" }));
    expect(localStorage.getItem("sam-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await user.click(screen.getByRole("button", { name: "light" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("resolves 'system' against the OS preference (dark)", async () => {
    setMatchMedia(true);
    const user = userEvent.setup();
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    await user.click(screen.getByRole("button", { name: "system" }));
    expect(screen.getByTestId("theme").textContent).toBe("system");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });
});

describe("<ThemeSync />", () => {
  it("adopts the server theme when no local preference exists", () => {
    render(<ThemeProvider><ThemeSync serverTheme="dark" /></ThemeProvider>);
    expect(localStorage.getItem("sam-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("does not override an existing local preference", () => {
    localStorage.setItem("sam-theme", "light");
    render(<ThemeProvider><ThemeSync serverTheme="dark" /></ThemeProvider>);
    expect(localStorage.getItem("sam-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
