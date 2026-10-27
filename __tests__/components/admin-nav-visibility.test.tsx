import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@/components/layout/language-switcher", () => ({ LanguageSwitcher: () => null }));

import { Header } from "@/components/layout/header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import type { Role } from "@/lib/permissions";

function renderHeader(role: Role) {
  return render(<Header user={{ name: "Pat", email: "pat@x.com", role }} />);
}

describe("Header administration menu", () => {
  it("is hidden for VIEWER and EDITOR", () => {
    for (const role of ["VIEWER", "EDITOR"] as const) {
      const { unmount } = renderHeader(role);
      expect(screen.queryByRole("button", { name: "administration" })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("shows only catalog pages to MAINTAINER", async () => {
    renderHeader("MAINTAINER");
    await userEvent.click(screen.getByRole("button", { name: "administration" }));
    expect(screen.getByRole("menuitem", { name: "manufacturers" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "suppliers" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "models" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "users" })).not.toBeInTheDocument();
  });

  it("shows every page to ADMIN", async () => {
    renderHeader("ADMIN");
    await userEvent.click(screen.getByRole("button", { name: "administration" }));
    expect(screen.getByRole("menuitem", { name: "users" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "settings" })).toBeInTheDocument();
  });
});

describe("MobileBottomNav", () => {
  it("links the admin tab to the role-aware /admin index", () => {
    render(<MobileBottomNav showAdminTab />);
    expect(screen.getByRole("link", { name: /administration/ })).toHaveAttribute("href", "/admin");
  });

  it("omits the admin tab when not allowed", () => {
    render(<MobileBottomNav showAdminTab={false} />);
    expect(screen.queryByRole("link", { name: /administration/ })).not.toBeInTheDocument();
  });
});
